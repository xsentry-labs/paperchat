import { createAdminClient } from "@/lib/supabase/admin";
import { embedText } from "@/lib/embeddings";

export interface RetrievedChunk {
  id: string;
  documentId: string;
  filename: string;
  content: string;
  page: number | null;
  chunkIndex: number;
  similarity: number;
}

/**
 * Retrieve the most relevant chunks for a query using pgvector cosine similarity.
 */
export async function retrieveChunks(
  query: string,
  docIds: string[],
  userId: string,
  k: number = 6
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedText(query);
  const admin = createAdminClient();

  // Use Supabase RPC for vector similarity search
  // This requires a database function — we'll call it match_chunks
  const { data, error } = await admin.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_count: k,
    filter_doc_ids: docIds,
    filter_user_id: userId,
  });

  if (error) {
    throw new Error(`Retrieval failed: ${error.message}`);
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    documentId: row.document_id as string,
    filename: row.filename as string,
    content: row.content as string,
    page: (row.metadata as Record<string, unknown>)?.page as number | null,
    chunkIndex: row.chunk_index as number,
    similarity: row.similarity as number,
  }));
}
