from fastapi import APIRouter, Depends, HTTPException, status
from core.auth import get_current_user, AuthUser
from core.supabase import get_supabase

router = APIRouter()


@router.get("/api/conversations/{conv_id}/messages")
async def get_messages(conv_id: str, user: AuthUser = Depends(get_current_user)):
    supabase = get_supabase()

    # Verify ownership
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

    result = (
        supabase.table("chat_messages")
        .select("*")
        .eq("conversation_id", conv_id)
        .order("created_at")
        .execute()
    )

    return {"messages": result.data or []}
