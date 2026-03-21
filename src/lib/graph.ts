/**
 * Knowledge graph operations — stored relationally in PostgreSQL.
 *
 * Visualization model (Obsidian-style):
 *   Nodes  = Documents
 *   Edges  = Two documents share ≥1 entity (weighted by shared entity count)
 *
 * Entity extraction still happens per-chunk during ingestion — entities are the
 * mechanism for finding document relationships, but they don't appear as nodes
 * in the frontend graph.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { ExtractedEntity } from "@/lib/entities";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GraphEntity {
  entity_id: string;
  name: string;
  type: string;
  chunk_ids: string[];
}

export interface GraphNode {
  id: string;
  type: "document";
  label: string;
  degree?: number; // number of other documents this doc links to
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number; // number of shared entities between the two documents
  sharedEntities: string[]; // entity names, used in detail panel
}

// ── Write operations ───────────────────────────────────────────────────────

/**
 * Persist extracted entities for a chunk.
 * Upserts entities (dedup by user_id+name) then creates chunk→entity edges.
 */
export async function storeChunkEntities(
  chunkId: string,
  userId: string,
  entities: ExtractedEntity[]
): Promise<void> {
  if (entities.length === 0) return;
  const admin = createAdminClient();

  for (const entity of entities) {
    const { data: entityRow, error: upsertErr } = await admin
      .from("entities")
      .upsert(
        { user_id: userId, name: entity.name, type: entity.type },
        { onConflict: "user_id,name" }
      )
      .select("id")
      .single();

    if (upsertErr || !entityRow) {
      console.error("[graph] entity upsert failed:", upsertErr?.message);
      continue;
    }

    const { error: edgeErr } = await admin
      .from("chunk_entities")
      .upsert({ chunk_id: chunkId, entity_id: entityRow.id });

    if (edgeErr) {
      console.error("[graph] chunk_entity upsert failed:", edgeErr.message);
    }
  }
}

// ── Read operations ────────────────────────────────────────────────────────

/**
 * Get all entities linked to a set of chunk IDs, with which chunks mention them.
 */
export async function getChunkEntities(
  chunkIds: string[]
): Promise<GraphEntity[]> {
  if (chunkIds.length === 0) return [];
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("chunk_entities")
    .select("chunk_id, entities(id, name, type)")
    .in("chunk_id", chunkIds);

  if (error || !data) return [];

  const map = new Map<string, GraphEntity>();
  for (const row of data) {
    const eRaw = row.entities as unknown;
    const e = Array.isArray(eRaw)
      ? (eRaw[0] as { id: string; name: string; type: string } | undefined)
      : (eRaw as { id: string; name: string; type: string } | null);
    if (!e) continue;
    if (!map.has(e.id)) {
      map.set(e.id, { entity_id: e.id, name: e.name, type: e.type, chunk_ids: [] });
    }
    map.get(e.id)!.chunk_ids.push(row.chunk_id);
  }

  return Array.from(map.values());
}

/**
 * Find additional chunk IDs that share entities with the already-retrieved set.
 * Used for graph-based context expansion in hybrid retrieval.
 */
export async function expandByEntities(
  entityIds: string[],
  excludeChunkIds: string[],
  limit = 3
): Promise<string[]> {
  if (entityIds.length === 0) return [];
  const admin = createAdminClient();

  let query = admin
    .from("chunk_entities")
    .select("chunk_id")
    .in("entity_id", entityIds);

  if (excludeChunkIds.length > 0) {
    query = query.not("chunk_id", "in", `(${excludeChunkIds.join(",")})`);
  }

  const { data } = await query.limit(limit);
  return [...new Set((data ?? []).map((r) => r.chunk_id))];
}

/**
 * Build the Obsidian-style graph for the frontend:
 *   - One node per document
 *   - One edge per document pair that shares ≥1 entity
 *   - Edge weight = number of shared entities
 */
export async function buildGraphForUser(userId: string): Promise<{
  nodes: GraphNode[];
  edges: GraphEdge[];
}> {
  const admin = createAdminClient();

  // 1. Fetch all ready documents
  const { data: docs } = await admin
    .from("documents")
    .select("id, filename")
    .eq("user_id", userId)
    .eq("status", "ready");

  if (!docs || docs.length === 0) return { nodes: [], edges: [] };

  // 2. Fetch all chunks for those documents
  const docIds = docs.map((d) => d.id);
  const { data: chunks } = await admin
    .from("chunks")
    .select("id, document_id")
    .in("document_id", docIds);

  if (!chunks || chunks.length === 0) {
    return {
      nodes: docs.map((d) => ({ id: d.id, type: "document", label: d.filename, degree: 0 })),
      edges: [],
    };
  }

  const chunkToDoc = new Map(chunks.map((c) => [c.id, c.document_id]));
  const chunkIds = chunks.map((c) => c.id);

  // 3. Fetch chunk→entity links
  const { data: ceRows } = await admin
    .from("chunk_entities")
    .select("chunk_id, entities(id, name)")
    .in("chunk_id", chunkIds);

  // 4. Build: entityId → Set of document IDs that mention it
  const entityToDocs = new Map<string, { name: string; docIds: Set<string> }>();

  for (const row of ceRows ?? []) {
    const eRaw = row.entities as unknown;
    const e = Array.isArray(eRaw)
      ? (eRaw[0] as { id: string; name: string } | undefined)
      : (eRaw as { id: string; name: string } | null);
    if (!e) continue;

    const docId = chunkToDoc.get(row.chunk_id);
    if (!docId) continue;

    if (!entityToDocs.has(e.id)) {
      entityToDocs.set(e.id, { name: e.name, docIds: new Set() });
    }
    entityToDocs.get(e.id)!.docIds.add(docId);
  }

  // 5. Build document-pair edges: count shared entities
  const pairShared = new Map<string, { count: number; names: string[] }>();

  for (const { name, docIds } of entityToDocs.values()) {
    if (docIds.size < 2) continue; // entity only in one doc → no link
    const arr = Array.from(docIds).sort();
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = `${arr[i]}|${arr[j]}`;
        if (!pairShared.has(key)) pairShared.set(key, { count: 0, names: [] });
        const entry = pairShared.get(key)!;
        entry.count += 1;
        if (entry.names.length < 10) entry.names.push(name);
      }
    }
  }

  const edges: GraphEdge[] = Array.from(pairShared.entries()).map(([key, val]) => {
    const [source, target] = key.split("|");
    return { source, target, weight: val.count, sharedEntities: val.names };
  });

  // 6. Compute degree per document node
  const degreeMap = new Map<string, number>();
  for (const e of edges) {
    degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1);
  }

  const nodes: GraphNode[] = docs.map((d) => ({
    id: d.id,
    type: "document",
    label: d.filename,
    degree: degreeMap.get(d.id) ?? 0,
  }));

  return { nodes, edges };
}
