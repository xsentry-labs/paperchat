import { createAdminClient } from "@/lib/supabase/admin";

const DAILY_QUERY_LIMIT = 50;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetsAt: string;
}

export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const admin = createAdminClient();

  // Count user messages created today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const { count, error } = await admin
    .from("chat_messages")
    .select("*", { count: "exact", head: true })
    .eq("role", "user")
    .gte("created_at", startOfDay.toISOString())
    .lte("created_at", endOfDay.toISOString())
    // Filter by conversation ownership
    .in(
      "conversation_id",
      (
        await admin
          .from("conversations")
          .select("id")
          .eq("user_id", userId)
      ).data?.map((c) => c.id) ?? []
    );

  if (error) {
    // Fail open — don't block users if rate limit check fails
    return { allowed: true, remaining: DAILY_QUERY_LIMIT, limit: DAILY_QUERY_LIMIT, resetsAt: endOfDay.toISOString() };
  }

  const used = count ?? 0;
  const remaining = Math.max(0, DAILY_QUERY_LIMIT - used);

  return {
    allowed: remaining > 0,
    remaining,
    limit: DAILY_QUERY_LIMIT,
    resetsAt: endOfDay.toISOString(),
  };
}
