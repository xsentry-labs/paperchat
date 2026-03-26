from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.auth import get_current_user, AuthUser
from core.supabase import get_supabase_admin
from core.models import is_valid_model

router = APIRouter()


class UpdateProfileRequest(BaseModel):
    preferred_model: str


@router.get("/api/profile")
async def get_profile(user: AuthUser = Depends(get_current_user)):
    supabase = get_supabase_admin()
    result = (
        supabase.table("profiles")
        .select("*")
        .eq("id", user.id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"profile": result.data}


@router.patch("/api/profile")
async def update_profile(
    body: UpdateProfileRequest,
    user: AuthUser = Depends(get_current_user),
):
    if not is_valid_model(body.preferred_model):
        raise HTTPException(status_code=400, detail="Invalid model ID")

    supabase = get_supabase_admin()
    result = (
        supabase.table("profiles")
        .update({"preferred_model": body.preferred_model})
        .eq("id", user.id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"profile": result.data[0]}
