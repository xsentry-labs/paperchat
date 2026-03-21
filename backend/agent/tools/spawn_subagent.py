from __future__ import annotations
from .base import Tool, ToolRegistry


class SpawnSubagentTool(Tool):
    def __init__(self, user_id: str, doc_ids: list[str] | None = None):
        self._user_id = user_id
        self._doc_ids = doc_ids
        self._registry: ToolRegistry | None = None

    def set_registry(self, registry: ToolRegistry) -> None:
        self._registry = registry

    @property
    def name(self) -> str:
        return "spawn_subagent"

    @property
    def description(self) -> str:
        return (
            "Delegate a complex, multi-step task to a subagent that will work autonomously. "
            "Use this when a task requires many sequential tool calls, long-running analysis, "
            "or independent research that would be better handled as a separate focused task. "
            "The subagent has access to all tools except spawn_subagent (no recursive spawning). "
            "Returns the subagent's final result."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "Clear, complete description of the task for the subagent to complete. Include all relevant context.",
                },
                "label": {
                    "type": "string",
                    "description": "Short label describing the task (for logging)",
                },
            },
            "required": ["task", "label"],
        }

    async def execute(self, task: str, label: str) -> str:
        from agent.subagent import run_subagent
        from agent.loop import build_tool_registry
        from core.config import settings

        # Build fresh tool registry for subagent
        registry = self._registry or build_tool_registry(
            user_id=self._user_id,
            doc_ids=self._doc_ids,
        )

        print(f"[subagent] Spawning: {label}")
        result = await run_subagent(
            task=task,
            parent_tools=registry,
            model=settings.default_model,
        )
        print(f"[subagent] Completed: {label}")
        return f"[Subagent '{label}' result]\n\n{result}"
