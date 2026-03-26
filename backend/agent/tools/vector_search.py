from __future__ import annotations
from .base import Tool
from core.embeddings import embed_text
from core.encryption import derive_user_key, decrypt
from core.supabase import get_supabase_admin


class VectorSearchTool(Tool):
    def __init__(self, user_id: str, doc_ids: list[str] | None = None):
        self._user_id = user_id
        self._doc_ids = doc_ids  # None = search across all user docs

    @property
    def name(self) -> str:
        return "vector_search"

    @property
    def description(self) -> str:
        return (
            "Search through the user's uploaded documents using semantic similarity. "
            "Use this to find relevant passages, facts, or data from the documents. "
            "Returns the most relevant text chunks with their source document and page."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to find relevant document passages",
                },
                "k": {
                    "type": "integer",
                    "description": "Number of results to return (default 5, max 10)",
                    "default": 5,
                },
            },
            "required": ["query"],
        }

    async def execute(self, query: str, k: int = 5) -> str:
        k = min(k, 10)
        embedding = await embed_text(query)
        supabase = get_supabase_admin()

        rpc_args = {
            "query_embedding": embedding,
            "match_count": k,
            "filter_user_id": self._user_id,
        }
        if self._doc_ids:
            rpc_args["filter_doc_ids"] = self._doc_ids

        result = supabase.rpc("match_chunks", rpc_args).execute()
        chunks = result.data or []

        if not chunks:
            return "No relevant document passages found."

        user_key = derive_user_key(self._user_id)
        lines = []
        for i, chunk in enumerate(chunks):
            content = decrypt(chunk.get("content", ""), user_key)
            filename = chunk.get("filename", "Unknown")
            page = chunk.get("metadata", {}).get("page")
            similarity = round(chunk.get("similarity", 0), 3)
            page_str = f" (page {page})" if page else ""
            lines.append(f"[{i+1}] {filename}{page_str} (similarity: {similarity})\n{content}")

        return "\n\n---\n\n".join(lines)
