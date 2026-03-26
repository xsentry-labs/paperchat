"""
POST /api/query — streaming agentic chat endpoint.
Compatible with Vercel AI SDK useChat SSE format.
"""
from __future__ import annotations
import asyncio
import json
import re
import time
import uuid
from dataclasses import dataclass
from typing import AsyncGenerator, Union

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.auth import get_current_user, AuthUser
from core.rate_limit import check_rate_limit
from core.supabase import get_supabase_admin
from core.models import DEFAULT_MODEL_ID, is_valid_model
from core.agent_logger import AgentLogEntry, RetrievedChunkLog, StepLog, write_agent_log
from agent.loop import run_agent, build_tool_registry
from agent.context import SYSTEM_PROMPT, build_messages

router = APIRouter()


# ---------------------------------------------------------------------------
# Typed queue items for the streaming pipeline
# ---------------------------------------------------------------------------

@dataclass
class _TokenItem:
    token: str

@dataclass
class _ToolEventItem:
    name: str
    status: str          # "start" | "done"
    duration_ms: int | None = None

_QueueItem = Union[_TokenItem, _ToolEventItem, None]  # None = sentinel / end


class MessagePart(BaseModel):
    type: str
    text: str | None = None


class ChatMessage(BaseModel):
    role: str
    content: str | None = None
    parts: list[MessagePart] | None = None


class QueryRequest(BaseModel):
    conversationId: str
    messages: list[ChatMessage]


def _extract_text(msg: ChatMessage) -> str:
    if msg.content:
        return msg.content
    if msg.parts:
        return " ".join(p.text or "" for p in msg.parts if p.type == "text")
    return ""


def _sse_text(token: str) -> str:
    """Vercel AI SDK text chunk format."""
    return f'0:{json.dumps(token)}\n'


def _sse_tool_event(name: str, status: str, duration_ms: int | None = None) -> str:
    """Vercel AI SDK data chunk (2:) — carries tool progress events."""
    payload: dict = {"type": "tool_event", "name": name, "status": status}
    if duration_ms is not None:
        payload["duration_ms"] = duration_ms
    return f'2:{json.dumps([payload])}\n'


def _sse_metadata(sources: list) -> str:
    """Vercel AI SDK message-metadata format."""
    payload = json.dumps({"sources": sources})
    return f'8:{payload}\n'


def _sse_start(message_id: str) -> str:
    """Vercel AI SDK v6 message start — required before text deltas."""
    return f'f:{json.dumps({"messageId": message_id})}\n'


def _sse_done() -> str:
    return 'd:{"finishReason":"stop"}\n'


async def _stream_response(
    request: QueryRequest,
    user: AuthUser,
) -> AsyncGenerator[str, None]:
    supabase = get_supabase_admin()

    # Rate limit check
    rate = await check_rate_limit(user.id)
    if not rate.allowed:
        error_payload = json.dumps({
            "error": "daily_limit_reached",
            "limit": rate.limit,
            "remaining": 0,
            "resetsAt": rate.resets_at,
        })
        yield f'3:{error_payload}\n'
        return

    # Get conversation
    conv_result = (
        supabase.table("conversations")
        .select("*, profiles(preferred_model)")
        .eq("id", request.conversationId)
        .eq("user_id", user.id)
        .single()
        .execute()
    )
    if not conv_result.data:
        yield f'3:{json.dumps({"error": "Conversation not found"})}\n'
        return

    conv = conv_result.data
    profile = conv.get("profiles") or {}
    preferred = profile.get("preferred_model") or ""
    model = preferred if is_valid_model(preferred) else DEFAULT_MODEL_ID

    # Extract latest user message
    user_messages = [m for m in request.messages if m.role == "user"]
    if not user_messages:
        yield f'3:{json.dumps({"error": "No user message provided"})}\n'
        return

    question = _extract_text(user_messages[-1])
    if not question.strip():
        yield f'3:{json.dumps({"error": "Empty question"})}\n'
        return

    # Load full conversation history from DB — the frontend's useChat only
    # tracks the current session, so request.messages is incomplete.
    db_messages = (
        supabase.table("chat_messages")
        .select("role, content")
        .eq("conversation_id", request.conversationId)
        .order("created_at")
        .execute()
    )
    history = [
        {"role": m["role"], "content": m["content"]}
        for m in (db_messages.data or [])
    ]

    # Get document IDs tied to this conversation (if any)
    doc_id = conv.get("document_id")
    doc_ids = [doc_id] if doc_id else None

    # Build tool registry for this user
    tools = build_tool_registry(user_id=user.id, doc_ids=doc_ids)

    # Collect streamed tokens
    collected_tokens: list[str] = []
    start_time = time.monotonic()

    event_queue: asyncio.Queue[_QueueItem] = asyncio.Queue()

    async def on_token(token: str) -> None:
        collected_tokens.append(token)
        event_queue.put_nowait(_TokenItem(token))

    async def on_tool_start(name: str, arguments: dict) -> None:
        event_queue.put_nowait(_ToolEventItem(name=name, status="start"))

    async def on_tool_end(name: str, duration_ms: int) -> None:
        event_queue.put_nowait(_ToolEventItem(name=name, status="done", duration_ms=duration_ms))

    # Build initial messages
    initial_messages = build_messages(
        system_prompt=SYSTEM_PROMPT,
        history=history,
        user_message=question,
    )

    # Save user message before streaming starts
    await _save_message(conv["id"], "user", question)

    # Emit message start event — required by AI SDK v6 before any text deltas
    yield _sse_start(str(uuid.uuid4()))

    # Run agent in background, stream events via queue
    agent_task = asyncio.create_task(
        _run_agent_task(initial_messages, tools, model, on_token, on_tool_start, on_tool_end, event_queue)
    )

    # Stream events as they arrive
    async for item in _drain_queue(event_queue, agent_task):
        if isinstance(item, _TokenItem):
            yield _sse_text(item.token)
        elif isinstance(item, _ToolEventItem):
            yield _sse_tool_event(item.name, item.status, item.duration_ms)

    # Get agent result — surface errors to the client instead of swallowing them
    agent_error = agent_task.exception()
    if agent_error:
        error_msg = str(agent_error)
        print(f"[query] Agent error: {error_msg}")
        yield f'3:{json.dumps({"error": error_msg})}\n'
        yield _sse_done()
        return

    agent_result = agent_task.result()
    final_content = "".join(collected_tokens)

    # Extract citation sources from content
    sources = _extract_sources(final_content, agent_result)

    # Yield sources via message-metadata
    if sources:
        yield _sse_metadata(sources)

    yield _sse_done()

    # Run post-stream work in parallel — client already has the done signal.
    steps = []
    if agent_result:
        steps = [StepLog(step=s["step"], duration_ms=s["duration_ms"], meta=s.get("meta", {}))
                 for s in agent_result.steps]

    entry = AgentLogEntry(
        user_id=user.id,
        conversation_id=conv["id"],
        user_query=question,
        retrieved_chunks=[],
        entities_used=[],
        steps=steps,
        final_output=final_content[:500],
        model_used=model,
    )

    post_tasks = [
        _save_message(conv["id"], "assistant", final_content, sources),
        write_agent_log(entry),
    ]
    if len(history) == 0:
        post_tasks.append(_auto_title(conv["id"], question))

    await asyncio.gather(*post_tasks)


async def _run_agent_task(initial_messages, tools, model, on_token, on_tool_start, on_tool_end, event_queue):
    from agent.loop import run_agent, AgentResult
    try:
        result = await run_agent(
            messages=initial_messages,
            tools=tools,
            model=model,
            on_token=on_token,
            on_tool_start=on_tool_start,
            on_tool_end=on_tool_end,
        )
        return result
    finally:
        await event_queue.put(None)  # Signal completion


async def _drain_queue(
    queue: asyncio.Queue[_QueueItem],
    task: asyncio.Task,
) -> AsyncGenerator[_QueueItem, None]:
    while True:
        try:
            item = await asyncio.wait_for(queue.get(), timeout=30.0)
            if item is None:
                break
            yield item
        except asyncio.TimeoutError:
            if task.done():
                break


def _extract_sources(content: str, agent_result) -> list[dict]:
    """Basic source extraction — look for [N] citations in the response."""
    # In the future this will be richer (tied to vector_search results)
    return []


async def _save_message(
    conversation_id: str,
    role: str,
    content: str,
    sources: list | None = None,
) -> None:
    try:
        supabase = get_supabase_admin()
        data: dict = {
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
        }
        if sources:
            data["sources"] = sources
        supabase.table("chat_messages").insert(data).execute()
    except Exception as e:
        print(f"[query] Failed to save {role} message: {e}")


async def _auto_title(conversation_id: str, question: str) -> None:
    try:
        from core.llm import llm_complete
        from core.config import settings
        title = await llm_complete(
            messages=[
                {"role": "system", "content": "Generate a short 4-6 word title for this conversation. Return only the title, no punctuation."},
                {"role": "user", "content": question},
            ],
            model=settings.default_model,
            max_tokens=20,
            temperature=0.3,
        )
        if title:
            supabase = get_supabase_admin()
            supabase.table("conversations").update({"title": title.strip()}).eq("id", conversation_id).execute()
    except Exception:
        pass


@router.post("/api/query")
async def query(
    request: QueryRequest,
    user: AuthUser = Depends(get_current_user),
):
    if not request.conversationId:
        raise HTTPException(status_code=400, detail="conversationId is required")

    return StreamingResponse(
        _stream_response(request, user),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
