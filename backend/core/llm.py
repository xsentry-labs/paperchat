"""OpenRouter LLM client with streaming support."""
from __future__ import annotations
import json
from dataclasses import dataclass, field
from typing import AsyncGenerator, Callable, Awaitable
from openai import AsyncOpenAI
from .config import settings


@dataclass
class ToolCallRequest:
    id: str
    name: str
    arguments: dict

    def to_message_part(self) -> dict:
        return {
            "id": self.id,
            "type": "function",
            "function": {
                "name": self.name,
                "arguments": json.dumps(self.arguments),
            },
        }


@dataclass
class LLMResponse:
    content: str | None
    tool_calls: list[ToolCallRequest] = field(default_factory=list)
    finish_reason: str = "stop"

    def to_message(self) -> dict:
        msg: dict = {"role": "assistant"}
        if self.content:
            msg["content"] = self.content
        if self.tool_calls:
            msg["tool_calls"] = [tc.to_message_part() for tc in self.tool_calls]
        return msg


def _get_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
        default_headers={
            "HTTP-Referer": "https://paperchat.app",
            "X-Title": "Paperchat",
        },
    )


async def llm_chat(
    messages: list[dict],
    model: str,
    tools: list[dict] | None = None,
    on_token: Callable[[str], Awaitable[None]] | None = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> LLMResponse:
    """
    Call OpenRouter. Streams tokens to on_token if provided.
    Returns full LLMResponse with content and/or tool_calls.
    """
    client = _get_client()

    kwargs: dict = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"

    content_parts: list[str] = []
    # tool_calls accumulator: id -> {name, arguments_chunks}
    tc_accum: dict[int, dict] = {}

    async with client.beta.chat.completions.stream(**kwargs) as stream:
        async for event in stream:
            delta = event.choices[0].delta if event.choices else None
            if delta is None:
                continue

            # Accumulate text
            if delta.content:
                content_parts.append(delta.content)
                if on_token:
                    await on_token(delta.content)

            # Accumulate tool calls
            if delta.tool_calls:
                for tc_delta in delta.tool_calls:
                    idx = tc_delta.index
                    if idx not in tc_accum:
                        tc_accum[idx] = {
                            "id": tc_delta.id or "",
                            "name": tc_delta.function.name or "" if tc_delta.function else "",
                            "args": "",
                        }
                    if tc_delta.id:
                        tc_accum[idx]["id"] = tc_delta.id
                    if tc_delta.function:
                        if tc_delta.function.name:
                            tc_accum[idx]["name"] = tc_delta.function.name
                        if tc_delta.function.arguments:
                            tc_accum[idx]["args"] += tc_delta.function.arguments

    tool_calls = []
    for idx in sorted(tc_accum.keys()):
        tc = tc_accum[idx]
        try:
            args = json.loads(tc["args"]) if tc["args"] else {}
        except json.JSONDecodeError:
            args = {}
        tool_calls.append(ToolCallRequest(
            id=tc["id"],
            name=tc["name"],
            arguments=args,
        ))

    return LLMResponse(
        content="".join(content_parts) or None,
        tool_calls=tool_calls,
    )


async def llm_complete(
    messages: list[dict],
    model: str,
    temperature: float = 0.3,
    max_tokens: int = 1024,
) -> str:
    """Simple non-streaming completion. Returns content string."""
    client = _get_client()
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content or ""
