import { createClient } from "@/lib/supabase/server";
import { backfillSummaries } from "@/lib/ingest";

export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const result = await backfillSummaries();
  return new Response(JSON.stringify(result));
}
