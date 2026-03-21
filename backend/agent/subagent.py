"""Subagent runner — same loop as main agent, but with restricted tool set."""
from __future__ import annotations
from .tools.base import ToolRegistry
from .loop import run_agent, AgentResult
from .context import SUBAGENT_SYSTEM_PROMPT
from core.config import settings


async def run_subagent(
    task: str,
    parent_tools: ToolRegistry,
    model: str,
) -> str:
    # Strip spawn_subagent to prevent recursive spawning
    tools = parent_tools.without("spawn_subagent")

    messages = [
        {"role": "system", "content": SUBAGENT_SYSTEM_PROMPT},
        {"role": "user", "content": task},
    ]

    result: AgentResult = await run_agent(
        messages=messages,
        tools=tools,
        model=model,
        on_token=None,  # Subagents don't stream
        max_iterations=settings.max_subagent_iterations,
    )

    return result.content or "[Subagent completed but returned no content]"
