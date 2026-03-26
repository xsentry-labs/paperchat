from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any
from .supabase import get_supabase_admin


@dataclass
class RetrievedChunkLog:
    id: str
    document_id: str
    filename: str
    page: int | None
    similarity: float


@dataclass
class StepLog:
    step: str  # "retrieval" | "graph_expansion" | "generation" | tool name
    duration_ms: int
    meta: dict = field(default_factory=dict)


@dataclass
class AgentLogEntry:
    user_id: str
    conversation_id: str | None
    user_query: str
    retrieved_chunks: list[RetrievedChunkLog]
    entities_used: list[dict]
    steps: list[StepLog]
    final_output: str | None
    model_used: str


def _serialize(obj: Any) -> Any:
    if isinstance(obj, list):
        return [_serialize(i) for i in obj]
    if hasattr(obj, "__dict__"):
        return {k: _serialize(v) for k, v in obj.__dict__.items()}
    return obj


async def write_agent_log(entry: AgentLogEntry) -> None:
    try:
        supabase = get_supabase_admin()
        supabase.table("agent_logs").insert({
            "user_id": entry.user_id,
            "conversation_id": entry.conversation_id,
            "user_query": entry.user_query,
            "retrieved_chunks": _serialize(entry.retrieved_chunks),
            "entities_used": entry.entities_used,
            "steps": _serialize(entry.steps),
            "final_output": entry.final_output,
            "model_used": entry.model_used,
        }).execute()
    except Exception as e:
        # Fire-and-forget: log but don't surface
        print(f"[agent_logger] Failed to write log: {e}")


async def get_agent_logs(
    user_id: str,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    limit = min(limit, 100)
    supabase = get_supabase_admin()

    result = (
        supabase.table("agent_logs")
        .select("*", count="exact")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    return {
        "logs": result.data or [],
        "total": result.count or 0,
        "limit": limit,
        "offset": offset,
    }
