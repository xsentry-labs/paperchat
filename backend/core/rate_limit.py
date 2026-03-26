from datetime import datetime, timezone, timedelta
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

        result = (
            supabase.table("chat_messages")
            .select("id", count="exact")
            .eq("role", "user")
            .gte("created_at", start_of_day)
            # Join through conversations to filter by user
            .execute()
        )

        # Count user messages for this user today via conversations join
        conv_result = (
            supabase.table("conversations")
            .select("id")
            .eq("user_id", user_id)
            .execute()
        )
        conv_ids = [c["id"] for c in (conv_result.data or [])]

        if not conv_ids:
            count = 0
        else:
            msg_result = (
                supabase.table("chat_messages")
                .select("id", count="exact")
                .eq("role", "user")
                .in_("conversation_id", conv_ids)
                .gte("created_at", start_of_day)
                .execute()
            )
            count = msg_result.count or 0

        remaining = max(0, limit - count)
        return RateLimitResult(
            allowed=remaining > 0,
            remaining=remaining,
            limit=limit,
            resets_at=resets_at,
        )
    except Exception:
        # Fail closed
        return RateLimitResult(
            allowed=False,
            remaining=0,
            limit=limit,
            resets_at=resets_at,
        )
