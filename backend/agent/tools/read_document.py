from __future__ import annotations
from .base import Tool
from core.supabase import get_supabase_admin
from core.encryption import derive_user_key, decrypt


class ReadDocumentTool(Tool):
    def __init__(self, user_id: str):
        self._user_id = user_id

    @property
    def name(self) -> str:
        return "read_document"

    @property
    def description(self) -> str:
        return (
            "Read the full text of a specific document by name or ID. "
            "Use this when you need to analyze an entire document rather than search for specific passages. "
            "Best for summarization, full-document analysis, or when vector_search isn't finding what you need."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "document_name": {
                    "type": "string",
                    "description": "Partial or full filename of the document to read",
                },
                "max_chars": {
                    "type": "integer",
                    "description": "Maximum characters to return (default 8000)",
                    "default": 8000,
                },
            },
            "required": ["document_name"],
        }

    async def execute(self, document_name: str, max_chars: int = 8000) -> str:
        supabase = get_supabase_admin()

        # Find document by name
        doc_result = (
            supabase.table("documents")
            .select("id, filename, summary, status")
            .eq("user_id", self._user_id)
            .ilike("filename", f"%{document_name}%")
            .eq("status", "ready")
            .limit(1)
            .execute()
        )

        if not doc_result.data:
            return f"No ready document matching '{document_name}' found."

        doc = doc_result.data[0]
        doc_id = doc["id"]

        # Get all chunks ordered by chunk_index
        chunks_result = (
            supabase.table("chunks")
            .select("content, chunk_index, metadata")
            .eq("document_id", doc_id)
            .order("chunk_index")
            .execute()
        )

        user_key = derive_user_key(self._user_id)
        parts: list[str] = []
        total_chars = 0

        for chunk in chunks_result.data or []:
            content = decrypt(chunk.get("content", ""), user_key)
            if total_chars + len(content) > max_chars:
                remaining = max_chars - total_chars
                if remaining > 100:
                    parts.append(content[:remaining] + "...")
                break
            parts.append(content)
            total_chars += len(content)

        full_text = "\n\n".join(parts)
        header = f"Document: {doc['filename']}\n"
        if doc.get("summary"):
            header += f"Summary: {doc['summary']}\n"
        header += f"\n--- Full Text ---\n"

        return header + full_text
