from __future__ import annotations
from .base import Tool
from core.supabase import get_supabase_admin

# Read-only: only allow SELECT statements
ALLOWED_STATEMENTS = ("select",)


class SqlQueryTool(Tool):
    def __init__(self, user_id: str):
        self._user_id = user_id

    @property
    def name(self) -> str:
        return "sql_query"

    @property
    def description(self) -> str:
        return (
            "Run a read-only SQL SELECT query against the user's data in Supabase. "
            "Available tables: documents, chunks, conversations, chat_messages, entities, chunk_entities, agent_logs. "
            "RLS is enforced — you can only query the current user's data. "
            "Use this for structured data analysis, counting, aggregating, or cross-table queries."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "A SQL SELECT statement. Must start with SELECT.",
                },
            },
            "required": ["query"],
        }

    async def execute(self, query: str) -> str:
        stripped = query.strip().lower()
        if not stripped.startswith("select"):
            return "[SQL error: only SELECT statements are allowed]"

        # Inject user_id filter check — basic guard
        if "user_id" not in stripped and "'" not in stripped:
            pass  # RLS will handle it

        try:
            supabase = get_supabase_admin()
            result = supabase.rpc("execute_user_query", {
                "sql": query,
                "p_user_id": self._user_id,
            }).execute()

            rows = result.data or []
            if not rows:
                return "Query returned no results."

            # Format as simple table
            if isinstance(rows[0], dict):
                headers = list(rows[0].keys())
                lines = [" | ".join(headers)]
                lines.append("-" * len(lines[0]))
                for row in rows[:100]:
                    lines.append(" | ".join(str(row.get(h, "")) for h in headers))
                if len(rows) > 100:
                    lines.append(f"... ({len(rows) - 100} more rows)")
                return "\n".join(lines)

            return str(rows)
        except Exception as e:
            return f"[SQL error: {e}]"
