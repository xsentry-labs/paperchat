from __future__ import annotations
import json
from abc import ABC, abstractmethod
from typing import Any


class Tool(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def description(self) -> str: ...

    @property
    @abstractmethod
    def parameters(self) -> dict: ...  # JSON Schema

    @abstractmethod
    async def execute(self, **kwargs) -> str: ...

    def to_definition(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def get_definitions(self) -> list[dict]:
        return [t.to_definition() for t in self._tools.values()]

    def without(self, *names: str) -> "ToolRegistry":
        """Return a new registry excluding the named tools."""
        registry = ToolRegistry()
        for name, tool in self._tools.items():
            if name not in names:
                registry.register(tool)
        return registry

    async def execute(self, name: str, arguments: dict) -> str:
        tool = self._tools.get(name)
        if not tool:
            return f"[Tool error: unknown tool '{name}']"
        try:
            result = await tool.execute(**arguments)
            # Truncate very long results
            if len(str(result)) > 16000:
                result = str(result)[:16000] + "\n... (truncated)"
            return str(result)
        except Exception as e:
            return f"[Tool error in '{name}': {e}]\n\nAnalyze the error above and try a different approach."
