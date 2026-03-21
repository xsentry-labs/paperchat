from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from api import (
    auth_routes,
    documents,
    conversations,
    messages,
    profile,
    rate_limit,
    graph,
    agent_logs,
    ingest,
    upload,
    query,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load spaCy model
    try:
        from ingestion.entities import load_nlp
        load_nlp()
        print("[startup] spaCy model loaded")
    except Exception as e:
        print(f"[startup] spaCy model failed to load: {e}")
    yield
    # Shutdown (nothing to clean up currently)


app = FastAPI(title="Paperchat Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(auth_routes.router)
app.include_router(documents.router)
app.include_router(conversations.router)
app.include_router(messages.router)
app.include_router(profile.router)
app.include_router(rate_limit.router)
app.include_router(graph.router)
app.include_router(agent_logs.router)
app.include_router(ingest.router)
app.include_router(upload.router)
app.include_router(query.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.port, reload=True)
