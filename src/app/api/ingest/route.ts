import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestDocument } from "@/lib/ingest";

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

  try {
    const result = await ingestDocument(document_id);
    return NextResponse.json({ success: true, chunks: result.chunks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const admin = createAdminClient();
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
