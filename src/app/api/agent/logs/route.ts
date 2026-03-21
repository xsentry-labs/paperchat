/**
 * GET /api/agent/logs
 *
 * Returns paginated agent execution traces for the authenticated user.
 * Each log contains: query, retrieved chunks, entities, pipeline steps, output.
 *
 * Query params:
 *   limit  (default 50, max 100)
 *   offset (default 0)
 *   conversationId (optional filter)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgentLogs } from "@/lib/agent-logger";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  try {
    const { logs, total } = await getAgentLogs(user.id, { limit, offset });
    return NextResponse.json({ logs, total, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
