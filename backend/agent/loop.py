"""
Core agent loop — nanobot-style while loop.
LLM → tool calls → execute → back to LLM → repeat until no tool calls.
"""
from __future__ import annotations
import time
from dataclasses import dataclass, field
from typing import Callable, Awaitable
from core.llm import llm_chat, LLMResponse
from core.config import settings
from .tools.base import ToolRegistry


@dataclass
class AgentResult:
    content: str | None
    tools_used: list[str]
    messages: list[dict]
    steps: list[dict] = field(default_factory=list)


async def run_agent(
    messages: list[dict],
    tools: ToolRegistry,
    model: str,
    on_token: Callable[[str], Awaitable[None]] | None = None,
    on_tool_start: Callable[[str, dict], Awaitable[None]] | None = None,
    on_tool_end: Callable[[str, int], Awaitable[None]] | None = None,
    max_iterations: int | None = None,
) -> AgentResult:
    if max_iterations is None:
        max_iterations = settings.max_agent_iterations

    tools_used: list[str] = []
    steps: list[dict] = []
    iteration = 0
    response: LLMResponse | None = None

    while iteration < max_iterations:
        t_start = time.monotonic()

        # Stream tokens only on the final answer pass (no pending tool calls).
        # On intermediate iterations the model returns tool_calls with empty content,
        # so on_token would never fire anyway — but we're explicit here.
        stream_callback = on_token if iteration > 0 else None

        response = await llm_chat(
            messages=messages,
            tools=tools.get_definitions() or None,
            model=model,
            on_token=stream_callback,
        )

        duration_ms = int((time.monotonic() - t_start) * 1000)

        if response.tool_calls:
            messages.append(response.to_message())

            for tool_call in response.tool_calls:
                if on_tool_start:
                    await on_tool_start(tool_call.name, tool_call.arguments)

                t_tool = time.monotonic()
                result = await tools.execute(tool_call.name, tool_call.arguments)
                tool_duration = int((time.monotonic() - t_tool) * 1000)

                if on_tool_end:
                    await on_tool_end(tool_call.name, tool_duration)

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result,
                })
                tools_used.append(tool_call.name)
                steps.append({
                    "step": tool_call.name,
                    "duration_ms": tool_duration,
                    "meta": {"arguments": tool_call.arguments},
                })

            iteration += 1
        else:
            # No tool calls — this is the final answer.
            # If iteration == 0, the model answered directly without tools.
            # Stream the response now if we withheld on_token earlier.
            if iteration == 0 and on_token and response.content:
                await on_token(response.content)

            steps.append({
                "step": "generation",
                "duration_ms": duration_ms,
                "meta": {"iteration": iteration},
            })
            break

    return AgentResult(
        content=response.content if response else None,
        tools_used=tools_used,
        messages=messages,
        steps=steps,
    )


def build_tool_registry(user_id: str, doc_ids: list[str] | None = None) -> ToolRegistry:
    """Build the standard tool registry for a user session."""
    from .tools.vector_search import VectorSearchTool
    from .tools.knowledge_graph import KnowledgeGraphTool
    from .tools.read_document import ReadDocumentTool
    from .tools.web_search import WebSearchTool
    from .tools.web_fetch import WebFetchTool
    from .tools.python_exec import PythonExecTool
    from .tools.plot_chart import PlotChartTool
    from .tools.sql_query import SqlQueryTool
    from .tools.spawn_subagent import SpawnSubagentTool

    registry = ToolRegistry()
    registry.register(VectorSearchTool(user_id=user_id, doc_ids=doc_ids))
    registry.register(KnowledgeGraphTool(user_id=user_id))
    registry.register(ReadDocumentTool(user_id=user_id))
    registry.register(WebSearchTool())
    registry.register(WebFetchTool())
    registry.register(PythonExecTool())
    registry.register(PlotChartTool())
    registry.register(SqlQueryTool(user_id=user_id))
    registry.register(SpawnSubagentTool(user_id=user_id, doc_ids=doc_ids))
    return registry
