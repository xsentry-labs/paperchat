/**
 * Knowledge graph operations — stored relationally in PostgreSQL.
 *
 * Graph model:
 *   Nodes:  Document | Chunk | Entity
 *   Edges:  CHUNK → DOCUMENT   (via chunks.document_id FK — already exists)
 *           CHUNK → ENTITY     (via chunk_entities junction table)
 *           ENTITY → ENTITY    (not implemented — add later if needed)
 *
 * All graph operations use the admin client (service role) because they
 * run server-side during ingestion or retrieval, bypassing RLS.
 *
 * For the frontend visualization we expose a separate /api/graph endpoint
 * that aggregates Document → Entity edges (collapsing chunks for clarity).
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
  type: "document" | "entity";
  label: string;
  entityType?: string; // only for entity nodes
  documentId?: string; // only for entity nodes (which doc they appear in)
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "mentions"; // doc → entity edge (aggregated from chunk_entities)
}

// ── Write operations ───────────────────────────────────────────────────────

/**
 * Persist extracted entities for a chunk.
 * Upsets entities (dedup by user_id+name) then creates chunk→entity edges.
 */
export async function storeChunkEntities(
  chunkId: string,
  userId: string,
  entities: ExtractedEntity[]
): Promise<void> {
  if (entities.length === 0) return;
  const admin = createAdminClient();

  for (const entity of entities) {
    // Upsert the entity node — dedup by (user_id, name)
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

    // Create the CHUNK → ENTITY edge
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

  // Group by entity
  const map = new Map<string, GraphEntity>();
  for (const row of data) {
    // Supabase may return joined records as object or single-element array
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
 * Build graph data for the frontend visualizer.
 * Returns Document nodes + Entity nodes + Document→Entity edges.
 * Chunks are collapsed for visual clarity.
 */
export async function buildGraphForUser(userId: string): Promise<{
  nodes: GraphNode[];
  edges: GraphEdge[];
}> {
  const admin = createAdminClient();

  // Get all ready documents for the user
  const { data: docs } = await admin
    .from("documents")
    .select("id, filename, status")
    .eq("user_id", userId)
    .eq("status", "ready");

  if (!docs || docs.length === 0) return { nodes: [], edges: [] };

  // Get all chunks for those documents
  const docIds = docs.map((d) => d.id);
  const { data: chunks } = await admin
    .from("chunks")
    .select("id, document_id")
    .in("document_id", docIds);

  if (!chunks || chunks.length === 0) {
    // Return just document nodes with no edges
    return {
      nodes: docs.map((d) => ({ id: d.id, type: "document", label: d.filename })),
      edges: [],
    };
  }

  const chunkIds = chunks.map((c) => c.id);
  const chunkToDoc = new Map(chunks.map((c) => [c.id, c.document_id]));

  // Get chunk→entity edges
  const { data: ceRows } = await admin
    .from("chunk_entities")
    .select("chunk_id, entities(id, name, type)")
    .in("chunk_id", chunkIds);

  // Build entity nodes and aggregate doc→entity edges
  const entityNodes = new Map<string, GraphNode>();
  const edgeSet = new Set<string>(); // "docId:entityId"
  const edges: GraphEdge[] = [];

  for (const row of ceRows ?? []) {
    const eRaw = row.entities as unknown;
    const e = Array.isArray(eRaw)
      ? (eRaw[0] as { id: string; name: string; type: string } | undefined)
      : (eRaw as { id: string; name: string; type: string } | null);
    if (!e) continue;

    if (!entityNodes.has(e.id)) {
      entityNodes.set(e.id, {
        id: e.id,
        type: "entity",
        label: e.name,
        entityType: e.type,
      });
    }

    const docId = chunkToDoc.get(row.chunk_id);
    if (docId) {
      const key = `${docId}:${e.id}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ source: docId, target: e.id, type: "mentions" });
      }
    }
  }

  const nodes: GraphNode[] = [
    ...docs.map((d) => ({ id: d.id, type: "document" as const, label: d.filename })),
    ...Array.from(entityNodes.values()),
  ];

  return { nodes, edges };
}
