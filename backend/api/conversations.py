from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from core.auth import get_current_user, AuthUser
from core.supabase import get_supabase_admin

router = APIRouter()


class CreateConversationRequest(BaseModel):
    document_id: str | None = None
    title: str | None = None


@router.get("/api/conversations")
async def list_conversations(
    user: AuthUser = Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    supabase = get_supabase_admin()
    result = (
        supabase.table("conversations")
        .select("*, documents(filename)", count="exact")
        .eq("user_id", user.id)
        .order("updated_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {
        "conversations": result.data or [],
        "total": result.count or 0,
    }


@router.post("/api/conversations", status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: CreateConversationRequest,
    user: AuthUser = Depends(get_current_user),
):
    supabase = get_supabase_admin()

    # Ensure profile exists
    supabase.table("profiles").upsert(
        {"id": user.id, "email": user.email},
        on_conflict="id",
    ).execute()

    insert_data: dict = {"user_id": user.id, "title": body.title or "New conversation"}
    if body.document_id:
        insert_data["document_id"] = body.document_id

    result = supabase.table("conversations").insert(insert_data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create conversation")

    return {"conversation": result.data[0]}


@router.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: str, user: AuthUser = Depends(get_current_user)):
    supabase = get_supabase_admin()

    conv = (
        supabase.table("conversations")
        .select("id")
        .eq("id", conv_id)
        .eq("user_id", user.id)
        .single()
        .execute()
    )
    if not conv.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    supabase.table("conversations").delete().eq("id", conv_id).eq("user_id", user.id).execute()

    return {"success": True}
