import { createAdminClient } from "@/lib/supabase/admin";
import { chunkText } from "@/lib/chunker";
import { embedBatch } from "@/lib/embeddings";
import { extractEntities } from "@/lib/entities";
import { storeChunkEntities } from "@/lib/graph";
import { encrypt, deriveUserKey } from "@/lib/encryption";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function ingestDocument(documentId: string) {
  const admin = createAdminClient();

  // Update status to processing
  await admin
    .from("documents")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", documentId);

  // Fetch document metadata (includes user_id for per-user encryption key)
  const { data: doc, error: docError } = await admin
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docError || !doc) {
    throw new Error(`Document not found: ${docError?.message}`);
  }

  // Download file from storage
  const { data: fileData, error: downloadError } = await admin.storage
    .from("documents")
    .download(doc.storage_path);

  if (downloadError || !fileData) {
    throw new Error(`Download failed: ${downloadError?.message}`);
  }

  // Parse document based on mime type
  const parsedContent = await parseDocument(fileData, doc.mime_type);

  // Chunk the text
  const chunks = chunkText(parsedContent.text, parsedContent.pages);

  if (chunks.length === 0) {
    throw new Error("No content could be extracted from document");
  }

  // Embed all chunks (embeddings stay unencrypted — needed raw for pgvector)
  const embeddings = await embedBatch(chunks.map((c) => c.content));

  // Derive per-user encryption key for content storage
  const encKey = deriveUserKey(doc.user_id);

  // Build chunk rows — content is AES-256-GCM encrypted
  const chunkRows = chunks.map((chunk, i) => ({
    document_id: documentId,
    content: encrypt(chunk.content, encKey), // encrypted at rest
    embedding: JSON.stringify(embeddings[i]),
    chunk_index: chunk.chunkIndex,
    metadata: chunk.metadata,
  }));

  // Insert chunks in batches of 50
  const insertedIds: string[] = [];
  for (let i = 0; i < chunkRows.length; i += 50) {
    const batch = chunkRows.slice(i, i + 50);
    const { data: inserted, error: insertError } = await admin
      .from("chunks")
      .insert(batch)
      .select("id");
    if (insertError) {
      throw new Error(`Chunk insert failed: ${insertError.message}`);
    }
    insertedIds.push(...(inserted ?? []).map((r) => r.id));
  }

  // ── Entity extraction + graph edges ──────────────────────────────────────
  // Extract entities from plaintext (before encryption), store graph edges.
  // Runs after insert so we have real chunk IDs.
  let totalEntities = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunkId = insertedIds[i];
    if (!chunkId) continue;

    const entities = extractEntities(chunks[i].content);
    totalEntities += entities.length;

    if (entities.length > 0) {
      // Fire-and-forget per chunk — don't block on individual failures
      storeChunkEntities(chunkId, doc.user_id, entities).catch((err) => {
        console.error(`[ingest] entity store failed for chunk ${chunkId}:`, err);
      });
    }
  }
  console.log(
    `[ingest] extracted ${totalEntities} entity mentions across ${chunks.length} chunks`
  );

  // Generate a brief summary
  const summary = await generateSummary(parsedContent.text, doc.filename);

  // Update document status to ready + save summary
  await admin
    .from("documents")
    .update({
      status: "ready",
      summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  return { chunks: chunks.length, entities: totalEntities };
}

/**
 * Generate summaries for existing documents that don't have one.
 */
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
      const { data: fileData } = await admin.storage
        .from("documents")
        .download(doc.storage_path);

      if (!fileData) continue;

      const parsed = await parseDocument(fileData, doc.mime_type);
      const summary = await generateSummary(parsed.text, doc.filename);

      if (summary) {
        await admin
          .from("documents")
          .update({ summary })
          .eq("id", doc.id);
        updated++;
      }
    } catch {
      // Skip failed docs
    }
  }

  return { updated };
}

async function generateSummary(text: string, filename: string): Promise<string | null> {
  // Take first ~3000 chars as sample for summary
  const sample = text.slice(0, 3000);

  // Try latest model first, fall back to gpt-4.1-mini
  const models = ["gpt-5.4-mini-2026-03-17", "gpt-4.1-mini"];

  for (const model of models) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: "Write a 2-3 sentence summary of this document. Be concise and factual. No preamble.",
          },
          {
            role: "user",
            content: `Filename: ${filename}\n\n${sample}`,
          },
        ],
        max_tokens: 150,
        temperature: 0.3,
      });
      const summary = response.choices[0]?.message?.content?.trim();
      if (summary) {
        console.log(`[ingest] Summary generated with ${model}: ${summary.slice(0, 80)}...`);
        return summary;
      }
    } catch (err) {
      console.error(`[ingest] Summary failed with ${model}:`, err instanceof Error ? err.message : err);
      continue;
    }
  }

  console.error("[ingest] All summary models failed");
  return null;
}

interface ParsedDocument {
  text: string;
  pages?: { text: string; page: number }[];
}

async function parseDocument(
  blob: Blob,
  mimeType: string
): Promise<ParsedDocument> {
  switch (mimeType) {
    case "application/pdf":
      return parsePdf(blob);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return parseDocx(blob);
    case "text/plain":
    case "text/markdown":
      return { text: await blob.text() };
    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

async function parsePdf(blob: Blob): Promise<ParsedDocument> {
  const { extractText } = await import("unpdf");
  const buffer = new Uint8Array(await blob.arrayBuffer());
  const { text } = await extractText(buffer, { mergePages: false });

  // text is an array of strings, one per page when mergePages is false
  const pageTexts = Array.isArray(text) ? text : [text];
  const pages = pageTexts.map((t, i) => ({
    text: cleanPdfPageText(typeof t === "string" ? t : String(t)),
    page: i + 1,
  }));
  const fullText = pages.map((p) => p.text).join("\n\n");

  return { text: fullText, pages };
}

/**
 * Clean up common PDF extraction artifacts on a per-page basis.
 */
function cleanPdfPageText(text: string): string {
  return text
    // Fix words broken by spaces (common in some PDF extractions)
    // e.g., "r e s p o n s i b l e" → detect and fix spaced-out words
    .replace(/\b([a-zA-Z])\s(?=[a-zA-Z]\s[a-zA-Z])/g, (match, char) => {
      // Only fix if this looks like a spaced-out word (3+ single chars in a row)
      return char;
    })
    // Fix single-char-spaced words: "O t h e r" → "Other"
    .replace(/(?<![a-zA-Z])([a-zA-Z]) ([a-zA-Z]) ([a-zA-Z])(?:(?: [a-zA-Z])+)/g, (match) => {
      // Only collapse if ALL parts are single chars
      const parts = match.split(" ");
      if (parts.every((p) => p.length === 1)) {
        return parts.join("");
      }
      return match;
    })
    // Fix words broken by mid-word spaces: "responsibl e" → "responsible"
    // Pattern: word fragment + space + 1-2 chars + space + word fragment
    .replace(/([a-zA-Z]{2,})\s([a-zA-Z])\s([a-zA-Z]{2,})/g, (match, pre, mid, post) => {
      // Check if joining makes a more likely word (no vowels = probably not a word break)
      const joined = pre + mid + post;
      // Simple heuristic: if the fragments don't look like separate words, join them
      if (mid.length === 1 && pre.length >= 2 && post.length >= 2) {
        return joined;
      }
      return match;
    })
    // Remove page break markers
    .replace(/\[Page Break\]/gi, "")
    // Remove common header/footer patterns (page numbers)
    .replace(/^\s*(?:Page\s+)?\d+\s*$/gm, "")
    // Clean up excessive whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function parseDocx(blob: Blob): Promise<ParsedDocument> {
  const mammoth = await import("mammoth");
  const buffer = Buffer.from(await blob.arrayBuffer());
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value };
}
