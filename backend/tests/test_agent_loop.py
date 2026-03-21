"""Agent loop unit tests with mocked LLM and tools."""
import os
import pytest
import asyncio

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")
os.environ.setdefault("OPENAI_API_KEY", "test")
os.environ.setdefault("OPENROUTER_API_KEY", "test")
os.environ.setdefault("ENCRYPTION_SECRET", "test-secret-32-chars-minimum-ok!")

from agent.tools.base import Tool, ToolRegistry
from agent.loop import run_agent, AgentResult
from core.llm import LLMResponse, ToolCallRequest


class EchoTool(Tool):
    """Test tool that echoes its input."""

    @property
    def name(self) -> str:
        return "echo"

    @property
    def description(self) -> str:
        return "Echo the input"

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        }

    async def execute(self, text: str) -> str:
        return f"Echo: {text}"


def make_registry(*tools) -> ToolRegistry:
    r = ToolRegistry()
    for t in tools:
        r.register(t)
    return r


async def _direct_answer_llm(**kwargs) -> LLMResponse:
    return LLMResponse(content="Direct answer without tools")


async def _one_tool_call_llm(call_count=[0], **kwargs) -> LLMResponse:
    call_count[0] += 1
    if call_count[0] == 1:
        return LLMResponse(
            content=None,
            tool_calls=[ToolCallRequest(id="call_1", name="echo", arguments={"text": "hello"})],
        )
    return LLMResponse(content="After using echo tool")


@pytest.mark.asyncio
async def test_direct_answer_no_tools(monkeypatch):
    import agent.loop as loop_mod
    monkeypatch.setattr(loop_mod, "llm_chat", lambda **kw: _direct_answer_llm(**kw))

    registry = make_registry(EchoTool())
    messages = [{"role": "user", "content": "What is 2+2?"}]

    result = await run_agent(messages=messages, tools=registry, model="test-model")

    assert result.content == "Direct answer without tools"
    assert result.tools_used == []
    assert len(result.steps) == 1
    assert result.steps[0]["step"] == "generation"


@pytest.mark.asyncio
async def test_tool_call_then_answer(monkeypatch):
    import agent.loop as loop_mod
    call_count = [0]

    async def mock_llm(**kwargs):
        call_count[0] += 1
        if call_count[0] == 1:
            return LLMResponse(
                content=None,
                tool_calls=[ToolCallRequest(id="call_1", name="echo", arguments={"text": "hello"})],
            )
        return LLMResponse(content="Final answer after tool")

    monkeypatch.setattr(loop_mod, "llm_chat", mock_llm)

    registry = make_registry(EchoTool())
    messages = [{"role": "user", "content": "Echo hello"}]

    result = await run_agent(messages=messages, tools=registry, model="test-model")

    assert result.content == "Final answer after tool"
    assert "echo" in result.tools_used
    # messages should include tool call + tool result
    roles = [m["role"] for m in result.messages]
    assert "tool" in roles


@pytest.mark.asyncio
async def test_unknown_tool_returns_error(monkeypatch):
    import agent.loop as loop_mod
    call_count = [0]

    async def mock_llm(**kwargs):
        call_count[0] += 1
        if call_count[0] == 1:
            return LLMResponse(
                content=None,
                tool_calls=[ToolCallRequest(id="c1", name="nonexistent_tool", arguments={})],
            )
        return LLMResponse(content="Done")

    monkeypatch.setattr(loop_mod, "llm_chat", mock_llm)
    registry = ToolRegistry()
    result = await run_agent(messages=[{"role": "user", "content": "x"}], tools=registry, model="m")

    # Should still complete, with error message in tool result
    tool_results = [m for m in result.messages if m["role"] == "tool"]
    assert len(tool_results) == 1
    assert "unknown tool" in tool_results[0]["content"].lower()


@pytest.mark.asyncio
async def test_max_iterations_respected(monkeypatch):
    import agent.loop as loop_mod

    async def always_tool_call(**kwargs):
        return LLMResponse(
            content=None,
            tool_calls=[ToolCallRequest(id="c1", name="echo", arguments={"text": "loop"})],
        )

    monkeypatch.setattr(loop_mod, "llm_chat", always_tool_call)
    registry = make_registry(EchoTool())
    result = await run_agent(
        messages=[{"role": "user", "content": "loop"}],
        tools=registry,
        model="m",
        max_iterations=3,
    )

    assert len(result.tools_used) == 3
