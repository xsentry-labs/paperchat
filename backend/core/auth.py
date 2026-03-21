from fastapi import Header, HTTPException, status
from .supabase import get_supabase
from .config import settings


class AuthUser:
    def __init__(self, id: str, email: str):
        self.id = id
        self.email = email


async def get_current_user(authorization: str = Header(...)) -> AuthUser:
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )

    token = authorization[len("Bearer "):]

    try:
        supabase = get_supabase()
        response = supabase.auth.get_user(token)
        user = response.user

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

        return AuthUser(id=user.id, email=user.email or "")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        ) from e


async def get_service_user(authorization: str = Header(...)) -> None:
    """Auth dependency for internal endpoints — validates service role key."""
    expected = f"Bearer {settings.supabase_service_role_key}"
    if authorization != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid service key",
        )
