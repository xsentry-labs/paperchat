/**
 * Agent activity logger — structured execution traces.
 *
 * Records WHAT the agent did for each query, not chain-of-thought.
 * Each log entry contains:
 *   - user_query: the question asked
 *   - retrieved_chunks: top-k chunks from embedding search
 *   - entities_used: entities extracted from those chunks
 *   - steps: ordered pipeline steps with timing
 *   - final_output: the assistant response
 *   - model_used: which LLM was invoked
 *
 * Logs are stored in the agent_logs table (see migration 013).
 * Exposed via GET /api/agent/logs.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { RetrievedChunk } from "@/lib/retrieval";

export interface AgentStep {
  step: "retrieval" | "graph_expansion" | "generation";
  duration_ms: number;
  meta?: Record<string, unknown>; // e.g. {chunks_found: 6, entities_found: 12}
}

export interface AgentLogEntry {
  userId: string;
  conversationId: string;
  userQuery: string;
  retrievedChunks: Array<{
    id: string;
    documentId: string;
    filename: string;
    page: number | null;
    similarity: number;
  }>;
  entitiesUsed: Array<{ name: string; type: string }>;
  steps: AgentStep[];
  finalOutput: string;
  modelUsed: string;
}

/**
 * Persist an agent execution trace.
 * Fire-and-forget: errors are logged but do not surface to the user.
 */
export async function writeAgentLog(entry: AgentLogEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("agent_logs").insert({
      user_id: entry.userId,
      conversation_id: entry.conversationId,
      user_query: entry.userQuery,
      retrieved_chunks: entry.retrievedChunks,
      entities_used: entry.entitiesUsed,
      steps: entry.steps,
      final_output: entry.finalOutput,
      model_used: entry.modelUsed,
    });
  } catch (err) {
    console.error("[agent-logger] failed to write log:", err);
  }
}

/**
 * Fetch paginated agent logs for a user.
 * Returns logs newest-first.
 */
export async function getAgentLogs(
  userId: string,
  opts: { limit?: number; offset?: number } = {}
) {
  const admin = createAdminClient();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const { data, error, count } = await admin
    .from("agent_logs")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Failed to fetch logs: ${error.message}`);
  return { logs: data ?? [], total: count ?? 0 };
}

/**
 * Small helper: build the retrievedChunks payload from RetrievedChunk[]
 */
export function chunksToLogPayload(
  chunks: RetrievedChunk[]
): AgentLogEntry["retrievedChunks"] {
  return chunks.map((c) => ({
    id: c.id,
    documentId: c.documentId,
    filename: c.filename,
    page: c.page,
    similarity: Math.round(c.similarity * 1000) / 1000,
  }));
}
