from fastapi import APIRouter, Depends
from pydantic import BaseModel
from core.auth import get_service_user

router = APIRouter()


class IngestRequest(BaseModel):
    document_id: str


@router.post("/api/ingest")
async def ingest_document(
    body: IngestRequest,
    _: None = Depends(get_service_user),
):
    from ingestion.pipeline import ingest_document as run_ingest
    result = await run_ingest(body.document_id)
    return {"success": True, "chunks": result["chunks"]}
