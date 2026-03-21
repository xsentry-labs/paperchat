import { createAdminClient } from "@/lib/supabase/admin";
import { embedText } from "@/lib/embeddings";
import { getChunkEntities, expandByEntities } from "@/lib/graph";
import { decrypt, deriveUserKey } from "@/lib/encryption";

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
 * Original embedding-only retrieval. Used internally by the hybrid function.
 */
export async function retrieveChunks(
  query: string,
  docIds: string[],
  userId: string,
  k: number = 6
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedText(query);
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_count: k,
    filter_doc_ids: docIds,
    filter_user_id: userId,
  });

  if (error) {
    throw new Error(`Retrieval failed: ${error.message}`);
  }

  const encKey = deriveUserKey(userId);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    documentId: row.document_id as string,
    filename: row.filename as string,
    // Decrypt content if it was stored encrypted
    content: decrypt(row.content as string, encKey),
    page: (row.metadata as Record<string, unknown>)?.page as number | null,
    chunkIndex: row.chunk_index as number,
    similarity: row.similarity as number,
  }));
}

export interface HybridRetrievalResult {
  chunks: RetrievedChunk[];
  entitiesUsed: Array<{ name: string; type: string }>;
}

/**
 * Hybrid retrieval: embeddings → graph expansion.
 *
 * Pipeline:
 *   1. Use pgvector cosine similarity to retrieve top-k chunks
 *   2. Look up entities linked to those chunks via knowledge graph
 *   3. Expand context by finding other chunks that share the same entities
 *   4. Fetch the expanded chunks and merge (deduplicated)
 *
 * Graph expansion adds at most 3 extra chunks to keep the context window lean.
 */
export async function retrieveChunksHybrid(
  query: string,
  docIds: string[],
  userId: string,
  k: number = 6
): Promise<HybridRetrievalResult> {
  // Step 1: Embedding-based retrieval
  const initialChunks = await retrieveChunks(query, docIds, userId, k);

  if (initialChunks.length === 0) {
    return { chunks: [], entitiesUsed: [] };
  }

  const initialIds = initialChunks.map((c) => c.id);

  // Step 2: Get entities from retrieved chunks (graph edges)
  const chunkEntities = await getChunkEntities(initialIds);

  if (chunkEntities.length === 0) {
    // No graph data yet (e.g. legacy docs before entity extraction)
    return { chunks: initialChunks, entitiesUsed: [] };
  }

  const entityIds = chunkEntities.map((e) => e.entity_id);
  const entitiesUsed = chunkEntities.map((e) => ({ name: e.name, type: e.type }));

  // Step 3: Expand via graph — find related chunks sharing the same entities
  const expandedIds = await expandByEntities(entityIds, initialIds, 3);

  if (expandedIds.length === 0) {
    return { chunks: initialChunks, entitiesUsed };
  }

  // Step 4: Fetch the expanded chunks from the DB
  const admin = createAdminClient();
  const encKey = deriveUserKey(userId);

  const { data: expandedRows } = await admin
    .from("chunks")
    .select("id, document_id, content, chunk_index, metadata, documents!inner(filename, user_id)")
    .in("id", expandedIds)
    .eq("documents.user_id", userId); // enforce ownership

  const expandedChunks: RetrievedChunk[] = (expandedRows ?? []).map((row) => {
    const docRaw = row.documents as unknown;
    const doc = Array.isArray(docRaw)
      ? (docRaw[0] as { filename: string } | undefined)
      : (docRaw as { filename: string } | null);
    return {
      id: row.id,
      documentId: row.document_id,
      filename: doc?.filename ?? "unknown",
      content: decrypt(row.content as string, encKey),
      page: (row.metadata as Record<string, unknown>)?.page as number | null,
      chunkIndex: row.chunk_index,
      similarity: 0, // expanded chunks don't have a similarity score
    };
  });

  // Merge initial + expanded, keeping initial order (higher similarity first)
  const merged = [...initialChunks, ...expandedChunks];

  return { chunks: merged, entitiesUsed };
}
