import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE } from "@/lib/constants";

export async function POST(request: Request) {
  // Verify auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate file type
  if (!ACCEPTED_FILE_TYPES.includes(file.type as typeof ACCEPTED_FILE_TYPES[number])) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}` },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
      { status: 400 }
    );
  }

  // Generate storage path: {user_id}/{timestamp}_{filename}
  const timestamp = Date.now();
  const storagePath = `${user.id}/${timestamp}_${file.name}`;

  // Upload to Supabase Storage using admin client (bypasses RLS)
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // Insert document record
  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      filename: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      status: "pending",
    })
    .select()
    .single();

  if (insertError) {
    // Clean up uploaded file on failure
    await admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json(
      { error: `Failed to save document: ${insertError.message}` },
      { status: 500 }
    );
  }

  // Trigger ingestion asynchronously (fire and forget)
  const ingestUrl = new URL("/api/ingest", request.url).toString();
  fetch(ingestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ document_id: doc.id }),
  }).catch(() => {
    // Ingest failure is handled within the ingest route itself
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}
