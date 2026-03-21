/**
 * GET /api/graph
 *
 * Returns the knowledge graph for the authenticated user's documents.
 * Used by the frontend KnowledgeGraph visualization component.
 *
 * Response:
 *   nodes: Array of {id, type, label, entityType?}
 *   edges: Array of {source, target, type}
 *
 * Nodes:
 *   - type="document" → one node per ready document
 *   - type="entity"   → one node per unique entity (person/place/org/concept)
 *
 * Edges:
 *   - type="mentions" → document node → entity node
 *     (aggregated from chunk_entities; chunks are collapsed for visual clarity)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildGraphForUser } from "@/lib/graph";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const graph = await buildGraphForUser(user.id);
    return NextResponse.json(graph);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
