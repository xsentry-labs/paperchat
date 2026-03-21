"""
POST /api/auth/refresh — exchange a Supabase refresh token for a fresh session.

The frontend calls this when it receives a 401 with detail="token_expired".
It returns a new access_token and refresh_token so the client can retry.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from core.supabase import get_supabase

router = APIRouter()


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int


@router.post("/api/auth/refresh", response_model=RefreshResponse)
async def refresh_session(body: RefreshRequest) -> RefreshResponse:
    """Exchange a refresh token for a new access + refresh token pair."""
    if not body.refresh_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="refresh_token is required",
        )

    try:
        supabase = get_supabase()
        response = supabase.auth.refresh_session(body.refresh_token)
        session = response.session

        if not session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid_refresh_token",
            )

        return RefreshResponse(
            access_token=session.access_token,
            refresh_token=session.refresh_token,
            expires_in=session.expires_in or 3600,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_refresh_token",
        ) from e
