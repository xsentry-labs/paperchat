from fastapi import APIRouter, Depends
from core.auth import get_current_user, AuthUser
from core.supabase import get_supabase

router = APIRouter()


@router.get("/api/graph")
async def get_graph(user: AuthUser = Depends(get_current_user)):
    supabase = get_supabase()

    # Get all ready documents for user
    docs_result = (
        supabase.table("documents")
        .select("id, filename, summary")
        .eq("user_id", user.id)
        .eq("status", "ready")
        .execute()
    )
    docs = docs_result.data or []
    if not docs:
        return {"nodes": [], "edges": []}

    doc_ids = [d["id"] for d in docs]

    # Get chunks for these docs
    chunks_result = (
        supabase.table("chunks")
        .select("id, document_id")
        .in_("document_id", doc_ids)
        .execute()
    )
    chunks = chunks_result.data or []
    chunk_ids = [c["id"] for c in chunks]
    chunk_to_doc = {c["id"]: c["document_id"] for c in chunks}

    if not chunk_ids:
        nodes = [
            {"id": d["id"], "type": "document", "label": d["filename"], "summary": d.get("summary"), "degree": 0}
            for d in docs
        ]
        return {"nodes": nodes, "edges": []}

    # Get chunk_entities for these chunks
    ce_result = (
        supabase.table("chunk_entities")
        .select("chunk_id, entity_id")
        .in_("chunk_id", chunk_ids)
        .execute()
    )
    chunk_entities = ce_result.data or []

    # Build entity -> doc mapping
    from collections import defaultdict
    entity_to_docs: dict[str, set[str]] = defaultdict(set)
    for ce in chunk_entities:
        doc_id = chunk_to_doc.get(ce["chunk_id"])
        if doc_id:
            entity_to_docs[ce["entity_id"]].add(doc_id)

    # Build doc-pair shared entity counts
    pair_entities: dict[tuple[str, str], list[str]] = defaultdict(list)
    for entity_id, doc_set in entity_to_docs.items():
        doc_list = sorted(doc_set)
        for i in range(len(doc_list)):
            for j in range(i + 1, len(doc_list)):
                pair = (doc_list[i], doc_list[j])
                pair_entities[pair].append(entity_id)

    # Get entity names for the pairs
    all_entity_ids = list({eid for eids in pair_entities.values() for eid in eids})
    entity_names: dict[str, str] = {}
    if all_entity_ids:
        ent_result = (
            supabase.table("entities")
            .select("id, name")
            .in_("id", all_entity_ids)
            .execute()
        )
        entity_names = {e["id"]: e["name"] for e in (ent_result.data or [])}

    # Build edges
    edges = []
    doc_degree: dict[str, int] = defaultdict(int)
    for (src, tgt), entity_ids in pair_entities.items():
        if len(entity_ids) == 0:
            continue
        shared_names = [entity_names.get(eid, eid) for eid in entity_ids[:10]]
        edges.append({
            "source": src,
            "target": tgt,
            "weight": len(entity_ids),
            "sharedEntities": shared_names,
        })
        doc_degree[src] += 1
        doc_degree[tgt] += 1

    # Build nodes
    nodes = [
        {
            "id": d["id"],
            "type": "document",
            "label": d["filename"],
            "summary": d.get("summary"),
            "degree": doc_degree.get(d["id"], 0),
        }
        for d in docs
    ]

    return {"nodes": nodes, "edges": edges}
