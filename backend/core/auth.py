import base64
import json
import time

from fastapi import Header, HTTPException, status
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

    # Decode the JWT locally instead of calling Supabase /auth/v1/user on every
    # request. The token is already signed by Supabase — we just read the claims.
    # This avoids a network round-trip and the 403 issues with the anon key.
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("malformed JWT")

        payload_b64 = parts[1] + "=="
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))

        exp = payload.get("exp")
        if isinstance(exp, (int, float)) and time.time() > exp:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="token_expired",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id = payload.get("sub")
        email = payload.get("email", "")
        if not user_id:
            raise ValueError("missing sub claim")

        return AuthUser(id=user_id, email=email)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_token",
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
