from fastapi import APIRouter, Depends
from core.auth import get_current_user, AuthUser
from core.rate_limit import check_rate_limit

router = APIRouter()


@router.get("/api/rate-limit")
async def get_rate_limit(user: AuthUser = Depends(get_current_user)):
    result = await check_rate_limit(user.id)
    return {
        "allowed": result.allowed,
        "remaining": result.remaining,
        "limit": result.limit,
        "resetsAt": result.resets_at,
    }
