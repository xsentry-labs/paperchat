SYSTEM_PROMPT = """You are a capable data analyst assistant. You have access to the user's uploaded documents and a set of tools to analyze, search, and reason about data.

When answering questions:
- If the answer is simple and you already know it, answer directly without using tools.
- If you need information from the user's documents, use vector_search or read_document.
- If you need to find connections between documents, use knowledge_graph.
- If the task requires multiple steps or complex analysis, use the tools step by step.
- For tasks that are very complex (many steps, long-running analysis), use spawn_subagent to delegate.
- Always cite your sources inline as [1], [2], etc. when using document content.
- Be concise and direct. Lead with the answer.

You are a data analyst — you can reason about data, identify patterns, compare documents, and provide actionable insights."""


SUBAGENT_SYSTEM_PROMPT = """You are a data analyst subagent handling a specific delegated task. Complete the task thoroughly using your available tools, then return a clear, structured result.

Be systematic: plan your approach, execute it step by step, and summarize your findings clearly."""


def build_messages(
    system_prompt: str,
    history: list[dict],
    user_message: str,
    context_blocks: str | None = None,
) -> list[dict]:
    messages = [{"role": "system", "content": system_prompt}]

    # Add conversation history
    messages.extend(history)

    # Build current user message with optional document context
    content = user_message
    if context_blocks:
        content = f"{context_blocks}\n\n---\n\nUser question: {user_message}"

    messages.append({"role": "user", "content": content})
    return messages
