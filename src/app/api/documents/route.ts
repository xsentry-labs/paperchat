import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: documents, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch documents: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ documents });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("id");

  if (!docId) {
    return NextResponse.json(
      { error: "Document ID required" },
      { status: 400 }
    );
  }

  // Fetch document to get storage path (RLS ensures ownership)
  const { data: doc, error: fetchError } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", docId)
    .single();

  if (fetchError || !doc) {
    return NextResponse.json(
      { error: "Document not found" },
      { status: 404 }
    );
  }

  // Delete from storage using admin client
  const admin = createAdminClient();
  await admin.storage.from("documents").remove([doc.storage_path]);

  // Delete document row (cascades to chunks, conversations, messages)
  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", docId);

  if (deleteError) {
    return NextResponse.json(
      { error: `Failed to delete document: ${deleteError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
