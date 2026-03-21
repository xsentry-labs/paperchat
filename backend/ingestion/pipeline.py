"""
Ingestion pipeline orchestrator.
Parse → Chunk → Embed → Encrypt → Store → Entity extract → Summarize
"""
from __future__ import annotations
from core.supabase import get_supabase
from core.embeddings import embed_batch
from core.encryption import derive_user_key, encrypt
from core.llm import llm_complete
from core.config import settings
from .parsers import parse_document
from .chunker import chunk_text
from .entities import extract_entities

BATCH_SIZE = 50


async def ingest_document(document_id: str) -> dict:
    supabase = get_supabase()

    # 1. Fetch document record
    doc_result = (
        supabase.table("documents")
        .select("*")
        .eq("id", document_id)
        .single()
        .execute()
    )
    doc = doc_result.data
    if not doc:
        raise ValueError(f"Document {document_id} not found")

    user_id = doc["user_id"]
    storage_path = doc["storage_path"]
    mime_type = doc["mime_type"]
    filename = doc["filename"]

    # 2. Set status to processing
    supabase.table("documents").update({"status": "processing"}).eq("id", document_id).execute()

    try:
        # 3. Download file from storage
        file_response = supabase.storage.from_("documents").download(storage_path)
        content = file_response

        # 4. Parse
        parsed = await parse_document(content, mime_type, filename)

        # 5. Chunk
        chunks = chunk_text(parsed.text, parsed.pages or None)

        if not chunks:
            raise ValueError("No content extracted from document")

        # 6. Embed all chunks
        texts = [c.content for c in chunks]
        embeddings = await embed_batch(texts)

        # 7. Encrypt chunk content
        user_key = derive_user_key(user_id)
        encrypted_texts = [encrypt(c.content, user_key) for c in chunks]

        # 8. Store chunks in batches
        chunk_records = []
        for i, (chunk, embedding, enc_text) in enumerate(zip(chunks, embeddings, encrypted_texts)):
            chunk_records.append({
                "document_id": document_id,
                "content": enc_text,
                "embedding": embedding,
                "chunk_index": chunk.chunk_index,
                "metadata": chunk.metadata,
            })

        inserted_chunk_ids = []
        for i in range(0, len(chunk_records), BATCH_SIZE):
            batch = chunk_records[i : i + BATCH_SIZE]
            result = supabase.table("chunks").insert(batch).execute()
            inserted_chunk_ids.extend([r["id"] for r in (result.data or [])])

        # 9. Extract entities (inline — background tasks unsafe in serverless)
        await _extract_and_store_entities(inserted_chunk_ids, chunks, user_id)

        # 10. Generate summary
        summary = await _generate_summary(parsed.text[:4000], filename)

        # 11. Mark document as ready
        supabase.table("documents").update({
            "status": "ready",
            "summary": summary,
        }).eq("id", document_id).execute()

        return {"chunks": len(chunks)}

    except Exception as e:
        supabase.table("documents").update({
            "status": "error",
            "error_message": str(e)[:500],
        }).eq("id", document_id).execute()
        raise


async def _extract_and_store_entities(
    chunk_ids: list[str],
    chunks: list,
    user_id: str,
) -> None:
    supabase = get_supabase()

    for chunk_id, chunk in zip(chunk_ids, chunks):
        try:
            entities = extract_entities(chunk.content)
            if not entities:
                continue

            # Upsert entities
            entity_records = [
                {"user_id": user_id, "name": e.name, "type": e.type}
                for e in entities
            ]
            ent_result = (
                supabase.table("entities")
                .upsert(entity_records, on_conflict="user_id,name")
                .execute()
            )

            # Create chunk_entity edges
            entity_ids = [r["id"] for r in (ent_result.data or [])]
            if entity_ids:
                ce_records = [
                    {"chunk_id": chunk_id, "entity_id": eid}
                    for eid in entity_ids
                ]
                supabase.table("chunk_entities").upsert(
                    ce_records, on_conflict="chunk_id,entity_id"
                ).execute()
        except Exception as e:
            print(f"[entities] Failed for chunk {chunk_id}: {e}")


async def _generate_summary(text: str, filename: str) -> str | None:
    try:
        return await llm_complete(
            messages=[
                {
                    "role": "system",
                    "content": "Summarize the following document in 2-3 sentences. Be concise and factual.",
                },
                {
                    "role": "user",
                    "content": f"Document: {filename}\n\n{text}",
                },
            ],
            model=settings.default_model,
            max_tokens=256,
            temperature=0.3,
        )
    except Exception:
        return None
