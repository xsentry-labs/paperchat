from __future__ import annotations
from .base import Tool


class WebFetchTool(Tool):
    @property
    def name(self) -> str:
        return "web_fetch"

    @property
    def description(self) -> str:
        return (
            "Fetch and extract readable text content from a URL. "
            "Use this to read articles, documentation, reports, or any web page. "
            "Returns the cleaned text content."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch",
                },
                "max_chars": {
                    "type": "integer",
                    "description": "Maximum characters to return (default 8000)",
                    "default": 8000,
                },
            },
            "required": ["url"],
        }

    async def execute(self, url: str, max_chars: int = 8000) -> str:
        import httpx
        from bs4 import BeautifulSoup

        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; Paperchat/1.0)",
            "Accept": "text/html,application/xhtml+xml,*/*",
        }

        async with httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
            headers=headers,
        ) as client:
            response = await client.get(url)
            response.raise_for_status()

        content_type = response.headers.get("content-type", "")
        if "html" in content_type:
            soup = BeautifulSoup(response.content, "lxml")
            for tag in soup(["script", "style", "nav", "header", "footer", "meta", "link"]):
                tag.decompose()
            text = soup.get_text(separator="\n")
            lines = [l.strip() for l in text.splitlines()]
            text = "\n".join(l for l in lines if l)
        else:
            text = response.text

        if len(text) > max_chars:
            text = text[:max_chars] + "\n... (truncated)"

        return f"Content from {url}:\n\n{text}"
