# paperchat

Chat with your documents. Upload PDFs, spreadsheets, presentations, ebooks, and more - get cited answers powered by AI.

Built with Next.js 15, FastAPI, Supabase, pgvector, and OpenRouter.

## Features

- **Document upload & processing** - drag in a PDF, DOCX, PPTX, XLSX, TXT, MD, HTML, or EPUB file. It gets parsed, chunked, embedded, and entity-extracted automatically. Scanned PDFs are processed with OCR.
- **Hybrid RAG** - combines vector similarity search with a lightweight knowledge graph. Retrieved chunks are expanded with related context via shared entities.
- **Obsidian-style knowledge graph** - documents become nodes; edges connect documents that share named entities. Edge thickness scales with shared entity count. Visualized as an interactive force-directed canvas.
- **Encryption at rest** - chunk content is AES-256-GCM encrypted in the database. Per-user keys are derived from a master secret; no key storage required.
- **15+ AI models** - switch between OpenAI, Anthropic, Google, Meta, Mistral, and DeepSeek models via OpenRouter. Model selector groups by provider and shows cost tier.
- **Citation cards** - every answer includes collapsible source cards showing the document name, page, and relevant quote. Sources are delivered via the stream, no round-trip to DB.
- **Agent activity log** - every query produces a structured execution trace: retrieved chunks, pipeline step timing, model used. Viewable at `/activity`.
- **File explorer** - organize documents by type (PDF, Word, Slides, Spreadsheets, Text, Markdown, HTML, Books) with live processing status.
- **Light and dark mode** - warm linen light mode and dark mode with system-aware flash prevention.
- **Streaming tool progress** - while the agent works, the chat UI shows which tool is running ("Searching documents…", "Querying data…", etc.) in real time via SSE data events before the answer starts streaming.
- **Session auto-refresh** - API calls attach the current Supabase access token automatically. On token expiry the client refreshes the session and retries the request transparently, with no visible interruption.
- **Rate limiting** - 50 queries/day on the free tier.
- **Skeleton loading** - minimalistic shimmer loading states throughout the UI to prevent empty state flashes.

## Getting started

### Prerequisites

- Node.js 20+
- Python 3.11+
- A [Supabase](https://supabase.com) project (free tier works)
- An [OpenAI](https://platform.openai.com) API key (for embeddings + summaries)
- An [OpenRouter](https://openrouter.ai) API key (for chat models)

### Setup

1. Clone the repo and install frontend dependencies:

```bash
npm install
```

2. Install backend dependencies:

```bash
cd backend
pip install -r requirements.txt
```

3. Create `.env.local` and fill in your keys:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Embeddings and document summaries (always required)
OPENAI_API_KEY=your-openai-key

# Chat models - set this to unlock all 15+ models
OPENROUTER_API_KEY=your-openrouter-key

# Encryption at rest - set a random secret (32+ chars)
# If omitted, a dev placeholder is used (not safe for production)
ENCRYPTION_SECRET=your-random-secret-here
```

4. Run all SQL migrations in order in the Supabase SQL Editor. They're in `supabase/migrations/` (001 through 013).

5. Start the backend:

```bash
cd backend
uvicorn main:app --reload --port 8000
```

6. Start the frontend dev server:

```bash
npm run dev
```

7. Open [localhost:3000](http://localhost:3000), sign up, upload a document, and start chatting.

### Tests

```bash
npm test
```

28 tests across encryption, entity extraction, and agent logging utilities.

### Deploy

Deploy to Vercel - set the same env vars in your Vercel project settings.

## Architecture

### Ingestion pipeline

```
Upload -> Parse -> Chunk -> Embed -> Encrypt -> Store
                               |
                       Entity extraction (compromise.js)
                               |
                       Graph edges (chunk -> entity)
```

Supported file types: PDF (with OCR for scanned pages), DOCX, PPTX, XLSX, TXT, MD, HTML, EPUB.

### Retrieval pipeline (per query)

```
Query -> Embed -> pgvector top-k -> get entities from graph
                                         |
                              find related chunks (graph expansion)
                                         |
                              merged context -> LLM -> stream
                                         |
                              message-metadata (sources) -> client
                                         |
                                  agent log written
```

Sources are delivered as a `message-metadata` stream part after text generation completes - no extra HTTP round-trip from the client.

### Knowledge graph

Stored relationally in Postgres - no graph database required.

| Table | Purpose |
|-------|---------|
| `entities` | Unique named entities per user (person/place/org/concept) |
| `chunk_entities` | CHUNK -> ENTITY edges (junction table) |
| `chunks.document_id` | CHUNK -> DOCUMENT edge (existing FK) |

The graph visualization shows documents as nodes and draws edges between documents that share named entities. Edge weight = number of shared entities.

Deletion is fully cascaded: removing a document removes its chunks, which removes all graph edges. Entities shared across multiple documents are preserved until all referencing chunks are gone.

## Stack

### Frontend
- **Next.js 15** - app router, server components, streaming API routes
- **Vercel AI SDK v6** - streaming chat with `createUIMessageStream` + `message-metadata` for inline source delivery
- **Tailwind CSS v4** - dark/light theme UI
- **compromise.js** - lightweight pure-JS NLP for entity extraction
- **Vitest** - unit tests

### Backend
- **FastAPI** - async Python API server
- **spaCy 3.8** - NLP for entity extraction during ingestion
- **PyMuPDF** - PDF parsing and OCR
- **openai 2.x** - embeddings (`text-embedding-3-small`) and LLM calls
- **pandas / numpy** - data processing for spreadsheet ingestion
- **python-docx / python-pptx / openpyxl / ebooklib** - document parsing (DOCX, PPTX, XLSX, EPUB)
- **cryptography** - AES-256-GCM encryption at rest

### Infrastructure
- **Supabase** - auth, Postgres, pgvector, file storage
- **OpenRouter** - multi-model LLM access (OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek)

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home - ask a question, start a conversation |
| `/chat/[id]` | Chat with citations and model selector |
| `/artifacts` | Upload documents; Files tab + Knowledge Graph tab |
| `/activity` | Agent execution traces (retrieval timing, chunks) |
| `/settings` | Model preference, storage, account |

## Next steps

- **Async ingestion** - move document processing to a background job so uploads return instantly
- **Billing** - Stripe integration, pro tier with higher limits
- **ENTITY -> ENTITY edges** - co-occurrence graph for richer traversal
- **MCP support** - Model Context Protocol for external tool integration
- **Scanned PDF support** - cloud OCR (OpenAI Vision / Google Vision) for serverless compatibility
