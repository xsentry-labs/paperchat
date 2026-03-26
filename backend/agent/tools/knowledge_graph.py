from __future__ import annotations
from .base import Tool
from core.supabase import get_supabase_admin
from core.encryption import derive_user_key, decrypt


class KnowledgeGraphTool(Tool):
    def __init__(self, user_id: str):
        self._user_id = user_id

    @property
    def name(self) -> str:
        return "knowledge_graph"

    @property
    def description(self) -> str:
        return (
            "Query the knowledge graph built from the user's documents. "
            "Find documents related to a specific entity (person, place, organization, concept), "
            "or discover what entities connect multiple documents. "
            "Useful for cross-document analysis and finding relationships."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "entity_name": {
                    "type": "string",
                    "description": "Entity name to search for (person, place, org, or concept)",
                },
                "action": {
                    "type": "string",
                    "enum": ["find_documents", "find_related_chunks"],
                    "description": (
                        "find_documents: which documents mention this entity; "
                        "find_related_chunks: get text chunks that mention this entity"
                    ),
                    "default": "find_documents",
                },
            },
            "required": ["entity_name"],
        }

    async def execute(self, entity_name: str, action: str = "find_documents") -> str:
        supabase = get_supabase_admin()

        # Find matching entities for this user
        ent_result = (
            supabase.table("entities")
            .select("id, name, type")
            .eq("user_id", self._user_id)
            .ilike("name", f"%{entity_name.lower()}%")
            .limit(5)
            .execute()
        )
        entities = ent_result.data or []

        if not entities:
            return f"No entity matching '{entity_name}' found in your documents."

        entity_ids = [e["id"] for e in entities]
        entity_display = ", ".join(f"{e['name']} ({e['type']})" for e in entities)

        if action == "find_documents":
            # Find chunks with these entities, then group by document
            ce_result = (
                supabase.table("chunk_entities")
                .select("chunk_id, chunks(document_id, documents(filename, summary))")
                .in_("entity_id", entity_ids)
                .execute()
            )
            rows = ce_result.data or []

            doc_map: dict[str, dict] = {}
            for row in rows:
                chunk = row.get("chunks", {})
                doc = chunk.get("documents", {})
                doc_id = chunk.get("document_id")
                if doc_id and doc_id not in doc_map:
                    doc_map[doc_id] = {
                        "filename": doc.get("filename", "Unknown"),
                        "summary": doc.get("summary"),
                    }

            if not doc_map:
                return f"Entities found ({entity_display}) but no documents linked."

            lines = [f"Documents mentioning '{entity_name}' (matched: {entity_display}):"]
            for doc_id, info in doc_map.items():
                summary = f" — {info['summary'][:100]}..." if info.get("summary") else ""
                lines.append(f"- {info['filename']}{summary}")
            return "\n".join(lines)

        else:  # find_related_chunks
            ce_result = (
                supabase.table("chunk_entities")
                .select("chunk_id")
                .in_("entity_id", entity_ids)
                .limit(5)
                .execute()
            )
            chunk_ids = [r["chunk_id"] for r in (ce_result.data or [])]

            if not chunk_ids:
                return f"No text chunks found for entity '{entity_name}'."

            chunks_result = (
                supabase.table("chunks")
                .select("content, metadata, documents(filename)")
                .in_("id", chunk_ids)
                .execute()
            )

            user_key = derive_user_key(self._user_id)
            lines = [f"Text passages mentioning '{entity_name}':"]
            for chunk in chunks_result.data or []:
                content = decrypt(chunk.get("content", ""), user_key)
                filename = (chunk.get("documents") or {}).get("filename", "Unknown")
                page = chunk.get("metadata", {}).get("page")
                page_str = f" p.{page}" if page else ""
                lines.append(f"\n[{filename}{page_str}]\n{content[:500]}")

            return "\n".join(lines)
