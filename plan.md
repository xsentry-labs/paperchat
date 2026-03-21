# Paperchat: Agentic Data Analyst Backend (Python/FastAPI)

## Context

Paperchat currently has a Next.js backend (API routes) that implements a hybrid RAG pipeline: upload docs → chunk → embed → encrypt → store, then retrieve via pgvector + knowledge graph expansion → stream LLM response. This works but is rigid — every query runs the same pipeline.

The goal is to replace the Node.js API routes with a Python/FastAPI backend that implements an **agentic data analyst** — an agent loop with tools that can reason about what to do, pick the right tools, and handle multi-step workflows. The Next.js frontend stays as-is, just points at the new backend.

Architecture inspired by [nanobot](https://github.com/HKUDS/nanobot): simple while-loop agent, tool registry, subagent spawning for complex tasks.

---

## Decisions

- **LLM Provider**: OpenRouter (single API, multi-model)
- **NLP/NER**: spaCy for now; hybrid spaCy + LLM extraction later (noted in Next Steps)
- **Repo structure**: Monorepo — new `/backend` folder alongside existing Next.js app
- **Subagent routing**: LLM decides via `spawn_subagent` tool
- **DB/Auth/Storage**: Keep Supabase (Postgres, pgvector, Auth, Storage) — use `supabase-py` SDK

---

## Architecture

```
Next.js Frontend (unchanged)
        │
        ▼ HTTP/SSE
┌─────────────────────────────────────────┐
│  FastAPI Backend  (/backend)            │
│                                         │
│  ┌─────────────┐   ┌────────────────┐   │
│  │  API Routes  │   │  Agent Loop    │   │
│  │  (REST/SSE)  │──▶│  (while loop)  │   │
│  └─────────────┘   └───────┬────────┘   │
│                            │            │
│                    ┌───────▼────────┐   │
│                    │  Tool Registry │   │
│                    └───────┬────────┘   │
│                            │            │
│         ┌──────────────────┼─────────┐  │
│         ▼        ▼         ▼         ▼  │
│    vector_search  knowledge_graph  web   │
│    read_document  pandas_query   plot    │
│    summarize      spawn_subagent  ...    │
│                                         │
│  ┌─────────────┐  ┌─────────────────┐   │
│  │  Ingestion   │  │  Supabase SDK   │   │
│  │  Pipeline    │  │  (auth/db/stor) │   │
│  └─────────────┘  └─────────────────┘   │
└─────────────────────────────────────────┘
```

---

## Project Structure

```
backend/
├── pyproject.toml              # Dependencies (uv/pip)
├── .env.example
├── main.py                     # FastAPI app entry, CORS, lifespan
│
├── api/                        # Route handlers (1:1 with current API routes)
│   ├── upload.py               # POST /api/upload
│   ├── documents.py            # GET/DELETE /api/documents
│   ├── conversations.py        # CRUD /api/conversations
│   ├── messages.py             # GET /api/conversations/{id}/messages
│   ├── query.py                # POST /api/query (SSE streaming)
│   ├── profile.py              # GET/PATCH /api/profile
│   ├── rate_limit.py           # GET /api/rate-limit
│   ├── graph.py                # GET /api/graph
│   ├── agent_logs.py           # GET /api/agent/logs
│   └── ingest.py               # POST /api/ingest (internal)
│
├── agent/                      # Core agent system (nanobot-inspired)
│   ├── loop.py                 # Agent loop: while has_tool_calls → execute → repeat
│   ├── context.py              # System prompt builder
│   ├── subagent.py             # Subagent spawning + result injection
│   └── tools/
│       ├── base.py             # Abstract Tool class + ToolRegistry
│       ├── vector_search.py    # Embed query → pgvector top-k → decrypt
│       ├── knowledge_graph.py  # Entity lookup, graph expansion, graph query
│       ├── read_document.py    # Read/summarize a specific document
│       ├── web_search.py       # Web search (via API)
│       ├── web_fetch.py        # Fetch + extract from URL
│       ├── python_exec.py      # Execute Python code (pandas, analysis)
│       ├── plot_chart.py       # Generate charts (matplotlib/plotly)
│       ├── spawn_subagent.py   # Delegate complex task to subagent
│       └── sql_query.py        # Query user's data via SQL (read-only)
│
├── ingestion/                  # Document processing pipeline
│   ├── pipeline.py             # Orchestrator: parse → chunk → embed → encrypt → store
│   ├── parsers.py              # PDF, DOCX, PPTX, XLSX, TXT, MD, HTML, EPUB
│   ├── chunker.py              # Recursive text splitter (~400 tokens, 100 overlap)
│   ├── ocr.py                  # Tesseract OCR for scanned PDFs
│   └── entities.py             # spaCy NER extraction
│
├── core/                       # Shared utilities
│   ├── supabase.py             # Supabase client (auth, db, storage)
│   ├── auth.py                 # JWT verification, get_current_user dependency
│   ├── embeddings.py           # OpenAI text-embedding-3-small
│   ├── encryption.py           # AES-256-GCM encrypt/decrypt (same format)
│   ├── llm.py                  # OpenRouter client wrapper
│   ├── models.py               # Model registry (same 15+ models)
│   ├── rate_limit.py           # Daily query limit check
│   ├── agent_logger.py         # Write/read agent execution traces
│   └── config.py               # Settings from env vars
│
└── tests/
    ├── test_encryption.py
    ├── test_chunker.py
    ├── test_entities.py
    ├── test_agent_loop.py
    └── test_tools.py
```

---

## Key Components

### 1. Agent Loop (`agent/loop.py`)

Simple nanobot-style while loop:

```python
async def run_agent(
    messages: list[dict],
    tools: ToolRegistry,
    model: str,
    on_token: Callable,  # SSE streaming callback
    max_iterations: int = 20,
) -> AgentResult:

    iteration = 0
    tools_used = []

    while iteration < max_iterations:
        response = await llm_chat(
            messages=messages,
            tools=tools.get_definitions(),
            model=model,
            stream=True,
            on_token=on_token,
        )

        if response.tool_calls:
            # Append assistant message with tool calls
            messages.append(response.to_message())

            for tool_call in response.tool_calls:
                result = await tools.execute(
                    tool_call.name, tool_call.arguments
                )
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": str(result),
                })
                tools_used.append(tool_call.name)

            iteration += 1
        else:
            # No tool calls — final answer
            break

    return AgentResult(
        content=response.content,
        tools_used=tools_used,
        messages=messages,
    )
```

### 2. Tool Base + Registry (`agent/tools/base.py`)

```python
class Tool(ABC):
    name: str
    description: str
    parameters: dict  # JSON Schema

    async def execute(self, **kwargs) -> str: ...

class ToolRegistry:
    def register(self, tool: Tool): ...
    def get_definitions(self) -> list[dict]:  # OpenAI function format
    async def execute(self, name: str, arguments: dict) -> str: ...
```

### 3. Subagent (`agent/subagent.py`)

```python
async def run_subagent(
    task: str,
    parent_tools: ToolRegistry,  # subset — no spawn_subagent
    model: str,
    max_iterations: int = 15,
) -> str:
    # Fresh tool registry without spawn_subagent (prevent recursion)
    tools = parent_tools.without("spawn_subagent")

    messages = [
        {"role": "system", "content": SUBAGENT_SYSTEM_PROMPT},
        {"role": "user", "content": task},
    ]

    result = await run_agent(messages, tools, model, on_token=noop)
    return result.content
```

### 4. Streaming Query Endpoint (`api/query.py`)

```python
@router.post("/api/query")
async def query(request: QueryRequest, user = Depends(get_current_user)):
    # Rate limit check
    # Get conversation
    # Build system prompt with context builder
    # Set up SSE streaming
    # Run agent loop with on_token callback that yields SSE events
    # After completion: extract sources, save messages, write agent log
    # Send sources via message-metadata event
```

### 5. Auth (`core/auth.py`)

FastAPI dependency that verifies Supabase JWT from the Authorization header:

```python
async def get_current_user(authorization: str = Header(...)) -> User:
    token = authorization.replace("Bearer ", "")
    user = supabase.auth.get_user(token)
    return user
```

### 6. Ingestion Pipeline (`ingestion/pipeline.py`)

Same pipeline as current, ported to Python:
- Parse (PyMuPDF for PDF, python-docx, python-pptx, openpyxl, etc.)
- Chunk (recursive splitter, same parameters)
- Embed (OpenAI SDK)
- Encrypt (same AES-256-GCM format — must be compatible with existing data)
- Store (Supabase)
- Extract entities (spaCy)
- Generate summary

### 7. Encryption Compatibility

**Critical**: The Python encryption must produce/consume the same `"{iv_hex}:{tag_hex}:{ciphertext_hex}"` format so existing encrypted chunks remain readable. Same key derivation: `SHA256(userId + ":" + ENCRYPTION_SECRET)`.

---

## Data Analyst Tools (Initial Set)

| Tool | Description | Subagent-safe |
|------|-------------|:---:|
| `vector_search` | Embed query → pgvector similarity search → decrypt results | Yes |
| `knowledge_graph` | Query entities, find related documents, graph traversal | Yes |
| `read_document` | Fetch and read a specific document's full text | Yes |
| `web_search` | Search the web for current information | Yes |
| `web_fetch` | Fetch and extract content from a URL | Yes |
| `python_exec` | Run Python code in a sandboxed env (pandas, numpy, etc.) | Yes |
| `plot_chart` | Generate charts/visualizations, return as base64 image | Yes |
| `sql_query` | Run read-only SQL against user's data | Yes |
| `spawn_subagent` | Delegate complex multi-step task to a subagent | **No** |

---

## API Route Mapping

All current endpoints replicated 1:1:

| Current (Next.js) | New (FastAPI) | Changes |
|---|---|---|
| POST /api/upload | POST /api/upload | Same |
| GET /api/documents | GET /api/documents | Same |
| DELETE /api/documents?id=X | DELETE /api/documents/{id} | Path param instead of query |
| POST /api/conversations | POST /api/conversations | Same |
| GET /api/conversations | GET /api/conversations | Same |
| DELETE /api/conversations?id=X | DELETE /api/conversations/{id} | Path param instead of query |
| GET /api/conversations/[id]/messages | GET /api/conversations/{id}/messages | Same |
| POST /api/query | POST /api/query | Now runs agent loop instead of fixed RAG |
| GET /api/profile | GET /api/profile | Same |
| PATCH /api/profile | PATCH /api/profile | Same |
| GET /api/rate-limit | GET /api/rate-limit | Same |
| GET /api/graph | GET /api/graph | Same |
| GET /api/agent/logs | GET /api/agent/logs | Same |
| POST /api/ingest | POST /api/ingest | Same |

---

## Frontend Changes

Minimal — just point API calls at the FastAPI server:
- Update `next.config.js` with a proxy rewrite: `/api/:path*` → `http://localhost:8000/api/:path*`
- OR set an env var for the API base URL
- SSE streaming format stays the same (Vercel AI SDK compatible)

---

## Implementation Order

### Phase 1: Foundation
1. Set up `/backend` with `pyproject.toml`, FastAPI app, CORS, config
2. Supabase client + auth dependency (JWT verification)
3. Encryption module (must be compatible with existing data)
4. Embeddings module (OpenAI)

### Phase 2: Port Existing API Routes
5. Document CRUD routes (GET/DELETE /api/documents)
6. Conversation CRUD routes
7. Messages route
8. Profile routes
9. Rate limit route
10. Graph route
11. Agent logs route

### Phase 3: Ingestion Pipeline
12. Document parsers (PDF, DOCX, PPTX, XLSX, TXT, MD, HTML, EPUB)
13. Chunker (recursive splitter)
14. OCR (Tesseract)
15. Entity extraction (spaCy)
16. Full ingestion pipeline orchestrator
17. Upload route

### Phase 4: Agent System
18. Tool base class + registry
19. `vector_search` tool
20. `knowledge_graph` tool
21. `read_document` tool
22. Agent loop (while loop with tool calling)
23. Streaming query endpoint (SSE)
24. Agent logger integration

### Phase 5: Extended Tools
25. `web_search` tool
26. `web_fetch` tool
27. `python_exec` tool (sandboxed)
28. `plot_chart` tool
29. `sql_query` tool
30. `spawn_subagent` tool + subagent runner

### Phase 6: Tests + Integration
31. Unit tests (encryption compat, chunker, entities, agent loop)
32. Integration test: upload → ingest → query → streamed response
33. Frontend proxy setup + end-to-end test

---

## Verification

1. **Encryption compat**: Encrypt with Node.js, decrypt with Python (and vice versa) using the same key
2. **API parity**: Hit every endpoint with the same payloads the frontend sends
3. **Streaming**: Verify SSE format matches what the Vercel AI SDK `useChat` expects
4. **Agent loop**: Query that requires 2+ tool calls completes correctly
5. **Subagent**: Complex query triggers spawn_subagent, result incorporated into response
6. **Existing data**: Existing chunks in DB decrypt correctly with the Python backend

---

## Next Steps (Post-MVP)

- **Hybrid NER**: Add LLM-based entity extraction as an agent tool alongside spaCy (user requested)
- **Async ingestion**: Background job queue (Celery/ARQ/Supabase Edge Functions) so uploads return instantly instead of blocking the request
- **MCP support**: Add Model Context Protocol for external tool integration
- **Streaming tool progress**: Stream intermediate tool results to the client during agent execution
- **Authentication hardening**: Refresh token handling, session management
- **Scanned PDF support**: Re-add OCR via a cloud API (e.g. OpenAI vision, Google Vision) instead of the Tesseract system binary — compatible with Vercel serverless

---

## Tech Debt

### Vercel Serverless Constraints (accepted trade-offs)

| Issue | Current state | Future fix |
|---|---|---|
| **Entity extraction runs inline** | Blocks ingestion response — adds ~1-3s per chunk batch | Move to async queue (ARQ, Celery, Supabase Edge Function) |
| **Post-query cleanup is synchronous** | `save_message`, `auto_title`, `write_agent_log` run after SSE done — client waits ~500ms extra after receiving the answer | Same: async queue |
| **Ingestion timeout risk** | Vercel Pro = 60s limit. Large docs (100+ pages) could hit it | Async ingestion queue |
| **spaCy cold start** | ~2-3s on first request to a cold lambda | Accept for now; pre-warm via cron ping if needed |

### Frontend Still Uses Old Node.js Lib Directly

The Next.js server components (React Server Components) in `src/app/` still import from `src/lib/` directly:
- `activity/page.tsx` → `getAgentLogs()` from `lib/agent-logger.ts`
- `artifacts/page.tsx` → `buildGraphForUser()` from `lib/graph.ts`, `backfillSummaries()` from `lib/ingest.ts`
- `chat/[id]/page.tsx` → `retrieveChunksHybrid()` from `lib/retrieval.ts`, `createLLMProvider()` from `lib/llm.ts`

These bypass the Python API entirely and still run the old Node.js implementations. **Fix**: refactor each page to call the REST API instead of importing lib functions directly, then delete `src/lib/` backend files.
