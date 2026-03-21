import base64
import json
import time

from fastapi import Header, HTTPException, status
from .supabase import get_supabase
from .config import settings


class AuthUser:
    def __init__(self, id: str, email: str):
        self.id = id
        self.email = email


def _is_jwt_expired(token: str) -> bool:
    """Decode the JWT payload (without verification) and check exp claim."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return False
        # Add padding so base64 decode doesn't fail
        payload_b64 = parts[1] + "=="
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        exp = payload.get("exp")
        return isinstance(exp, (int, float)) and time.time() > exp
    except Exception:
        return False


async def get_current_user(authorization: str = Header(...)) -> AuthUser:
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[len("Bearer "):]

    try:
        supabase = get_supabase()
        response = supabase.auth.get_user(token)
        user = response.user

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="token_expired" if _is_jwt_expired(token) else "invalid_token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return AuthUser(id=user.id, email=user.email or "")
    except HTTPException:
        raise
    except Exception as e:
        # Check if it's an expired token before returning a generic error
        detail = "token_expired" if _is_jwt_expired(token) else "invalid_token"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


async def get_service_user(authorization: str = Header(...)) -> None:
    """Auth dependency for internal endpoints — validates service role key."""
    expected = f"Bearer {settings.supabase_service_role_key}"
    if authorization != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid service key",
        )
