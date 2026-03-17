import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkText } from "@/lib/chunker";
import { embedBatch } from "@/lib/embeddings";

// Allow up to 60s for large documents
export const maxDuration = 60;

export async function POST(request: Request) {
  // Verify internal call via service role key in Authorization header
  const authHeader = request.headers.get("authorization");
  const expectedKey = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
  if (authHeader !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { document_id } = await request.json();
  if (!document_id) {
    return NextResponse.json(
      { error: "document_id required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  try {
    // Update status to processing
    await admin
      .from("documents")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", document_id);

    // Fetch document metadata
    const { data: doc, error: docError } = await admin
      .from("documents")
      .select("*")
      .eq("id", document_id)
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

    // Embed all chunks
    const embeddings = await embedBatch(chunks.map((c) => c.content));

    // Insert chunks into database
    const chunkRows = chunks.map((chunk, i) => ({
      document_id,
      content: chunk.content,
      embedding: JSON.stringify(embeddings[i]),
      chunk_index: chunk.chunkIndex,
      metadata: chunk.metadata,
    }));

    // Insert in batches of 50
    for (let i = 0; i < chunkRows.length; i += 50) {
      const batch = chunkRows.slice(i, i + 50);
      const { error: insertError } = await admin.from("chunks").insert(batch);
      if (insertError) {
        throw new Error(`Chunk insert failed: ${insertError.message}`);
      }
    }

    // Update document status to ready
    await admin
      .from("documents")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", document_id);

    return NextResponse.json({
      success: true,
      chunks: chunks.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Update document status to error
    await admin
      .from("documents")
      .update({
        status: "error",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", document_id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  const buffer = Buffer.from(await blob.arrayBuffer());
  const result = await pdfParse(buffer);

  // pdf-parse gives us the full text; attempt page-level extraction
  // The numpages property tells us page count
  // For now return as plain text (pdf-parse doesn't expose per-page text easily)
  return {
    text: result.text,
    pages: [{ text: result.text, page: 1 }],
  };
}

async function parseDocx(blob: Blob): Promise<ParsedDocument> {
  const mammoth = await import("mammoth");
  const buffer = Buffer.from(await blob.arrayBuffer());
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value };
}
