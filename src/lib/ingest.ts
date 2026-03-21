import { createAdminClient } from "@/lib/supabase/admin";
import { chunkText } from "@/lib/chunker";
import { embedBatch } from "@/lib/embeddings";
import { extractEntities } from "@/lib/entities";
import { storeChunkEntities } from "@/lib/graph";
import { encrypt, deriveUserKey } from "@/lib/encryption";
import { isLikelyScanned, ocrPdf, OCR_MAX_PAGES } from "@/lib/ocr";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function ingestDocument(documentId: string) {
  const admin = createAdminClient();

  await admin
    .from("documents")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", documentId);

  const { data: doc, error: docError } = await admin
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docError || !doc) {
    throw new Error(`Document not found: ${docError?.message}`);
  }

  const { data: fileData, error: downloadError } = await admin.storage
    .from("documents")
    .download(doc.storage_path);

  if (downloadError || !fileData) {
    throw new Error(`Download failed: ${downloadError?.message}`);
  }

  const parsedContent = await parseDocument(fileData, doc.mime_type);

  const chunks = chunkText(parsedContent.text, parsedContent.pages);
  if (chunks.length === 0) {
    throw new Error("No content could be extracted from document");
  }

  const embeddings = await embedBatch(chunks.map((c) => c.content));
  const encKey = deriveUserKey(doc.user_id);

  const chunkRows = chunks.map((chunk, i) => ({
    document_id: documentId,
    content: encrypt(chunk.content, encKey),
    embedding: JSON.stringify(embeddings[i]),
    chunk_index: chunk.chunkIndex,
    metadata: chunk.metadata,
  }));

  const insertedIds: string[] = [];
  for (let i = 0; i < chunkRows.length; i += 50) {
    const batch = chunkRows.slice(i, i + 50);
    const { data: inserted, error: insertError } = await admin
      .from("chunks")
      .insert(batch)
      .select("id");
    if (insertError) throw new Error(`Chunk insert failed: ${insertError.message}`);
    insertedIds.push(...(inserted ?? []).map((r) => r.id));
  }

  // Entity extraction + graph edges
  let totalEntities = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunkId = insertedIds[i];
    if (!chunkId) continue;
    const entities = extractEntities(chunks[i].content);
    totalEntities += entities.length;
    if (entities.length > 0) {
      storeChunkEntities(chunkId, doc.user_id, entities).catch((err) => {
        console.error(`[ingest] entity store failed for chunk ${chunkId}:`, err);
      });
    }
  }
  console.log(
    `[ingest] ${chunks.length} chunks, ${totalEntities} entity mentions${parsedContent.ocrUsed ? " (OCR)" : ""}`
  );

  const summary = await generateSummary(parsedContent.text, doc.filename);

  await admin
    .from("documents")
    .update({ status: "ready", summary, updated_at: new Date().toISOString() })
    .eq("id", documentId);

  return { chunks: chunks.length, entities: totalEntities, ocrUsed: parsedContent.ocrUsed };
}

export async function backfillSummaries() {
  const admin = createAdminClient();
  const { data: docs } = await admin
    .from("documents")
    .select("id, filename, storage_path, mime_type")
    .eq("status", "ready")
    .is("summary", null);

  if (!docs || docs.length === 0) return { updated: 0 };

  let updated = 0;
  for (const doc of docs) {
    try {
      const { data: fileData } = await admin.storage.from("documents").download(doc.storage_path);
      if (!fileData) continue;
      const parsed = await parseDocument(fileData, doc.mime_type);
      const summary = await generateSummary(parsed.text, doc.filename);
      if (summary) {
        await admin.from("documents").update({ summary }).eq("id", doc.id);
        updated++;
      }
    } catch { /* skip */ }
  }
  return { updated };
}

async function generateSummary(text: string, filename: string): Promise<string | null> {
  const sample = text.slice(0, 3000);
  const models = ["gpt-5.4-mini-2026-03-17", "gpt-4.1-mini"];
  for (const model of models) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: "Write a 2-3 sentence summary of this document. Be concise and factual. No preamble." },
          { role: "user", content: `Filename: ${filename}\n\n${sample}` },
        ],
        max_tokens: 150,
        temperature: 0.3,
      });
      const summary = response.choices[0]?.message?.content?.trim();
      if (summary) {
        console.log(`[ingest] Summary with ${model}: ${summary.slice(0, 80)}…`);
        return summary;
      }
    } catch (err) {
      console.error(`[ingest] Summary failed (${model}):`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

// ── Document parsers ──────────────────────────────────────────────────────────

interface ParsedDocument {
  text: string;
  pages?: { text: string; page: number }[];
  ocrUsed?: boolean;
}

async function parseDocument(blob: Blob, mimeType: string): Promise<ParsedDocument> {
  switch (mimeType) {
    case "application/pdf":
      return parsePdf(blob);

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return parseDocx(blob);

    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return parsePptx(blob);

    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return parseXlsx(blob);

    case "text/html":
      return parseHtml(blob);

    case "application/epub+zip":
      return parseEpub(blob);

    case "text/plain":
    case "text/markdown":
      return { text: await blob.text() };

    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

// ── PDF — with OCR fallback for scanned documents ────────────────────────────

async function parsePdf(blob: Blob): Promise<ParsedDocument> {
  const { extractText } = await import("unpdf");
  const buffer = new Uint8Array(await blob.arrayBuffer());

  const { text: rawText } = await extractText(buffer, { mergePages: false });
  const pageTexts = Array.isArray(rawText) ? rawText : [rawText];

  const pages = pageTexts.map((t, i) => ({
    text: cleanPdfPageText(typeof t === "string" ? t : String(t)),
    page: i + 1,
  }));
  const fullText = pages.map((p) => p.text).join("\n\n");

  // Scanned PDF detection — fall back to Tesseract OCR if text is too sparse
  if (isLikelyScanned(fullText, pages.length)) {
    console.log(
      `[ingest] PDF appears scanned (${pages.length} pages, low text density) — running OCR`
    );
    try {
      const ocr = await ocrPdf(buffer, pages.length);
      if (ocr.text.trim().length > fullText.trim().length) {
        // OCR produced more text — use it
        return { text: ocr.text, pages: ocr.pages, ocrUsed: true };
      }
    } catch (err) {
      console.error("[ingest] OCR failed, using original text:", err);
    }
  }

  return { text: fullText, pages };
}

function cleanPdfPageText(text: string): string {
  return text
    .replace(/\b([a-zA-Z])\s(?=[a-zA-Z]\s[a-zA-Z])/g, (_, char) => char)
    .replace(/(?<![a-zA-Z])([a-zA-Z]) ([a-zA-Z]) ([a-zA-Z])(?:(?: [a-zA-Z])+)/g, (match) => {
      const parts = match.split(" ");
      return parts.every((p) => p.length === 1) ? parts.join("") : match;
    })
    .replace(/([a-zA-Z]{2,})\s([a-zA-Z])\s([a-zA-Z]{2,})/g, (match, pre, mid, post) => {
      return mid.length === 1 && pre.length >= 2 && post.length >= 2 ? pre + mid + post : match;
    })
    .replace(/\[Page Break\]/gi, "")
    .replace(/^\s*(?:Page\s+)?\d+\s*$/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── DOCX ─────────────────────────────────────────────────────────────────────

async function parseDocx(blob: Blob): Promise<ParsedDocument> {
  const mammoth = await import("mammoth");
  const buffer = Buffer.from(await blob.arrayBuffer());
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value };
}

// ── PPTX — Microsoft PowerPoint ──────────────────────────────────────────────
// officeparser extracts text from all slides in order.

async function parsePptx(blob: Blob): Promise<ParsedDocument> {
  const officeParser = await import("officeparser");
  const buffer = Buffer.from(await blob.arrayBuffer());

  const ast = await officeParser.parseOffice(buffer);
  const text = ast.toText();
  return { text: cleanOfficeText(text) };
}

// ── XLSX — Microsoft Excel ────────────────────────────────────────────────────
// Converts each sheet to a readable text table (tab-separated).

async function parseXlsx(blob: Blob): Promise<ParsedDocument> {
  const XLSX = await import("xlsx");
  const buffer = Buffer.from(await blob.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const sections: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // csv output preserves row/column structure better than plain text
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    const cleaned = csv
      .split("\n")
      .filter((line) => line.replace(/,/g, "").trim().length > 0) // drop empty rows
      .join("\n");

    if (cleaned.trim()) {
      sections.push(`Sheet: ${sheetName}\n${cleaned}`);
    }
  }

  return { text: sections.join("\n\n") };
}

// ── HTML ──────────────────────────────────────────────────────────────────────
// Strips tags and script/style elements, preserving readable content.

async function parseHtml(blob: Blob): Promise<ParsedDocument> {
  const { parse } = await import("node-html-parser");
  const html = await blob.text();
  const root = parse(html);

  // Remove non-content elements
  root.querySelectorAll("script, style, nav, header, footer, aside").forEach((el) => el.remove());

  const text = root.text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text };
}

// ── EPUB ──────────────────────────────────────────────────────────────────────
// EPUBs are ZIP archives containing HTML/XHTML content files.
// We unzip, find the reading order from the OPF manifest+spine, then
// extract text from each content file in order.

async function parseEpub(blob: Blob): Promise<ParsedDocument> {
  const JSZip = (await import("jszip")).default;
  const { parse } = await import("node-html-parser");

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());

  // Step 1: locate the OPF file via META-INF/container.xml
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) throw new Error("Invalid EPUB: missing META-INF/container.xml");

  const opfMatch = containerXml.match(/full-path="([^"]+\.opf)"/i);
  if (!opfMatch) throw new Error("Invalid EPUB: cannot find OPF path");
  const opfPath = opfMatch[1];

  // Step 2: parse OPF to get manifest + spine
  const opfXml = await zip.file(opfPath)?.async("text");
  if (!opfXml) throw new Error("Invalid EPUB: missing OPF file");

  const baseDir = opfPath.includes("/")
    ? opfPath.split("/").slice(0, -1).join("/") + "/"
    : "";

  // Build id→href map from manifest
  const manifest = new Map<string, string>();
  for (const m of opfXml.matchAll(/<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"/g)) {
    manifest.set(m[1], m[2]);
  }
  // Also match reversed attribute order
  for (const m of opfXml.matchAll(/<item[^>]+href="([^"]+)"[^>]+id="([^"]+)"/g)) {
    manifest.set(m[2], m[1]);
  }

  // Reading order from spine
  const idrefs = [...opfXml.matchAll(/idref="([^"]+)"/g)].map((m) => m[1]);

  // Step 3: extract text from each spine item
  const sections: string[] = [];
  for (const idref of idrefs) {
    const href = manifest.get(idref);
    if (!href) continue;

    // href may include fragment; strip it
    const filePath = (baseDir + href.split("#")[0]).replace(/\/\//g, "/");
    const html = await zip.file(filePath)?.async("text");
    if (!html) continue;

    const root = parse(html);
    root.querySelectorAll("script, style").forEach((el) => el.remove());

    const text = root.text
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (text) sections.push(text);
  }

  if (sections.length === 0) {
    throw new Error("No readable content found in EPUB");
  }

  return { text: sections.join("\n\n") };
}

// ── Shared utilities ──────────────────────────────────────────────────────────

/**
 * Clean up extra whitespace that officeparser sometimes leaves in PPTX/DOCX output.
 */
function cleanOfficeText(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Export OCR_MAX_PAGES so the UI can show the limit if needed
export { OCR_MAX_PAGES };
