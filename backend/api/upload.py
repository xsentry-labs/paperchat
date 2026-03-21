import time
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from core.auth import get_current_user, AuthUser
from core.supabase import get_supabase

router = APIRouter()

ACCEPTED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/markdown",
    "text/html",
    "application/epub+zip",
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/api/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    user: AuthUser = Depends(get_current_user),
):
    # Validate MIME type
    if file.content_type not in ACCEPTED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}",
        )

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 50 MB)")

    supabase = get_supabase()
    timestamp = int(time.time() * 1000)
    storage_path = f"{user.id}/{timestamp}_{file.filename}"

    # Upload to Supabase storage
    try:
        supabase.storage.from_("documents").upload(
            path=storage_path,
            file=content,
            file_options={"content-type": file.content_type},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    # Create document record
    doc_result = supabase.table("documents").insert({
        "user_id": user.id,
        "filename": file.filename,
        "storage_path": storage_path,
        "mime_type": file.content_type,
        "size_bytes": len(content),
        "status": "pending",
    }).execute()

    if not doc_result.data:
        raise HTTPException(status_code=500, detail="Failed to create document record")

    doc = doc_result.data[0]

    # Trigger ingestion synchronously
    try:
        from ingestion.pipeline import ingest_document
        await ingest_document(doc["id"])
        # Re-fetch to get updated status
        updated = supabase.table("documents").select("*").eq("id", doc["id"]).single().execute()
        doc = updated.data or doc
    except Exception as e:
        print(f"[upload] Ingestion failed for {doc['id']}: {e}")

    return {"document": doc}
