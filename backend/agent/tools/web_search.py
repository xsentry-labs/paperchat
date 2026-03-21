from __future__ import annotations
from .base import Tool
from core.config import settings


class WebSearchTool(Tool):
    @property
    def name(self) -> str:
        return "web_search"

    @property
    def description(self) -> str:
        return (
            "Search the web for current information. "
            "Use this for recent news, facts not in documents, market data, or anything requiring up-to-date information."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5)",
                    "default": 5,
                },
            },
            "required": ["query"],
        }

    async def execute(self, query: str, max_results: int = 5) -> str:
        if not settings.tavily_api_key:
            return await self._duckduckgo_search(query, max_results)
        return await self._tavily_search(query, max_results)

    async def _tavily_search(self, query: str, max_results: int) -> str:
        import httpx

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": settings.tavily_api_key,
                    "query": query,
                    "max_results": min(max_results, 10),
                    "search_depth": "basic",
                },
            )
            response.raise_for_status()
            data = response.json()

        results = data.get("results", [])
        if not results:
            return f"No web results found for: {query}"

        lines = [f"Web search results for: {query}\n"]
        for i, r in enumerate(results[:max_results]):
            lines.append(f"[{i+1}] {r.get('title', 'No title')}")
            lines.append(f"URL: {r.get('url', '')}")
            lines.append(r.get("content", "")[:300])
            lines.append("")

        return "\n".join(lines)

    async def _duckduckgo_search(self, query: str, max_results: int) -> str:
        """Fallback: DuckDuckGo instant answers API (no key required, limited)."""
        import httpx

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_html": "1"},
            )
            data = response.json()

        abstract = data.get("AbstractText", "")
        answer = data.get("Answer", "")
        related = data.get("RelatedTopics", [])[:max_results]

        parts = [f"Web search results for: {query}\n"]
        if answer:
            parts.append(f"Answer: {answer}\n")
        if abstract:
            parts.append(f"Summary: {abstract}\n")
        if related:
            parts.append("Related topics:")
            for topic in related:
                if isinstance(topic, dict) and topic.get("Text"):
                    parts.append(f"- {topic['Text'][:200]}")

        if len(parts) == 1:
            return f"No results found. Consider adding a TAVILY_API_KEY for better web search."

        return "\n".join(parts)
