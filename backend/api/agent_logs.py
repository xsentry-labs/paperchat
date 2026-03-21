from fastapi import APIRouter, Depends, Query
from core.auth import get_current_user, AuthUser
from core.agent_logger import get_agent_logs

router = APIRouter()


@router.get("/api/agent/logs")
async def list_agent_logs(
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    user: AuthUser = Depends(get_current_user),
):
    return await get_agent_logs(user.id, limit=limit, offset=offset)
