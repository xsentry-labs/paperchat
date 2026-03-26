from datetime import datetime, timezone
from dataclasses import dataclass
from .supabase import get_supabase_admin
from .config import settings


@dataclass
class RateLimitResult:
    allowed: bool
    remaining: int
    limit: int
    resets_at: str  # ISO8601


async def check_rate_limit(user_id: str) -> RateLimitResult:
    limit = settings.daily_query_limit

    # End of today UTC
    now = datetime.now(timezone.utc)
    end_of_day = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    resets_at = end_of_day.isoformat()

    try:
        supabase = get_supabase_admin()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

        # Single query: count user messages today via inner join on conversations
        result = (
            supabase.table("chat_messages")
            .select("id, conversations!inner(user_id)", count="exact")
            .eq("role", "user")
            .eq("conversations.user_id", user_id)
            .gte("created_at", start_of_day)
            .execute()
        )
        count = result.count or 0

        remaining = max(0, limit - count)
        return RateLimitResult(
            allowed=remaining > 0,
            remaining=remaining,
            limit=limit,
            resets_at=resets_at,
        )
    except Exception:
        # Fail open — don't block users if rate limit check fails
        return RateLimitResult(
            allowed=True,
            remaining=limit,
            limit=limit,
            resets_at=resets_at,
        )
