from fastapi import APIRouter, Depends, HTTPException, status
from core.auth import get_current_user, AuthUser
from core.supabase import get_supabase_admin

router = APIRouter()


@router.get("/api/documents")
async def list_documents(user: AuthUser = Depends(get_current_user)):
    supabase = get_supabase_admin()
    result = (
        supabase.table("documents")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"documents": result.data or []}


@router.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str, user: AuthUser = Depends(get_current_user)):
    supabase = get_supabase_admin()

    # Verify ownership
    doc = (
        supabase.table("documents")
        .select("id, storage_path")
        .eq("id", doc_id)
        .eq("user_id", user.id)
        .single()
        .execute()
    )
    if not doc.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    storage_path = doc.data.get("storage_path")

    # Delete from storage
    if storage_path:
        try:
            supabase.storage.from_("documents").remove([storage_path])
        except Exception:
            pass  # Don't block deletion if storage fails

    # Delete DB record (cascades to chunks, chunk_entities)
    supabase.table("documents").delete().eq("id", doc_id).eq("user_id", user.id).execute()

    return {"success": True}
