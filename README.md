# paperchat

Chat with your documents. Upload PDFs, text files, markdown, or Word docs and ask questions — get cited answers powered by AI.

Built with Next.js 15, Supabase, pgvector, and OpenRouter.

## Features

- **Document upload & processing** — drag in a PDF, DOCX, TXT, or MD file. It gets parsed, chunked, embedded, and entity-extracted automatically.
- **Hybrid RAG** — combines vector similarity search with a lightweight knowledge graph. Retrieved chunks are expanded with related context via shared entities.
- **Knowledge graph** — entities (people, places, organizations, concepts) are extracted from every document using [compromise.js](https://compromisejs.com) and stored relationally. Visualized as an interactive force-directed graph.
- **Encryption at rest** — chunk content is AES-256-GCM encrypted in the database. Per-user keys are derived from a master secret; no key storage required.
- **15+ AI models** — switch between OpenAI, Anthropic, Google, Meta, Mistral, and DeepSeek models via OpenRouter. Model selector groups by provider and shows cost tier.
- **Citation cards** — every answer includes source cards showing the document name, page, and relevant quote.
- **Agent activity log** — every query produces a structured execution trace: retrieved chunks, entities used, pipeline step timing. Viewable at `/activity`.
- **File explorer** — organize documents by type with live processing status (amber = processing, green = ready, red = failed).
- **Rate limiting** — 50 queries/day on the free tier.

## Getting started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)
- An [OpenAI](https://platform.openai.com) API key (for embeddings + summaries)
- An [OpenRouter](https://openrouter.ai) API key (for chat models)

### Setup

1. Clone the repo and install dependencies:

```bash
npm install
```

2. Create `.env.local` and fill in your keys:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Embeddings and document summaries (always required)
OPENAI_API_KEY=your-openai-key

# Chat models — set this to unlock all 15+ models
OPENROUTER_API_KEY=your-openrouter-key

# Encryption at rest — set a random secret (32+ chars)
# If omitted, a dev placeholder is used (not safe for production)
ENCRYPTION_SECRET=your-random-secret-here
```

3. Run all SQL migrations in order in the Supabase SQL Editor. They're in `supabase/migrations/` (001 through 013).

4. Start the dev server:

```bash
npm run dev
```

5. Open [localhost:3000](http://localhost:3000), sign up, upload a document, and start chatting.

### Tests

```bash
npm test
```

28 tests across encryption, entity extraction, and agent logging utilities.

### Deploy

Deploy to Vercel — set the same env vars in your Vercel project settings.

## Architecture

### Ingestion pipeline

```
Upload → Parse → Chunk → Embed → Encrypt → Store
                              ↓
                      Entity extraction (compromise.js)
                              ↓
                      Graph edges (chunk → entity)
```

### Retrieval pipeline (per query)

```
Query → Embed → pgvector top-k → get entities from graph
                                         ↓
                              find related chunks (graph expansion)
                                         ↓
                              merged context → LLM → stream
                                         ↓
                                  agent log written
```

### Knowledge graph

Stored relationally in Postgres — no graph database required.

| Table | Purpose |
|-------|---------|
| `entities` | Unique named entities per user (person/place/org/concept) |
| `chunk_entities` | CHUNK → ENTITY edges (junction table) |
| `chunks.document_id` | CHUNK → DOCUMENT edge (existing FK) |

Deletion is fully cascaded: removing a document removes its chunks, which removes all graph edges. Entities shared across multiple documents are preserved until all referencing chunks are gone.

## Stack

- **Next.js 15** — app router, server components, streaming API routes
- **Supabase** — auth, Postgres, pgvector, file storage
- **OpenAI** — `text-embedding-3-small` for document embeddings
- **OpenRouter** — multi-model LLM access (OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek)
- **compromise.js** — lightweight pure-JS NLP for entity extraction
- **Vercel AI SDK** — streaming chat responses
- **Vitest** — unit tests
- **Tailwind CSS v4** — dark theme UI

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home — ask a question, start a conversation |
| `/chat/[id]` | Chat with citations and model selector |
| `/artifacts` | Upload documents; Files tab + Graph tab |
| `/activity` | Agent execution traces (retrieval timing, entities, chunks) |
| `/settings` | Model preference, storage, account |

## Next steps

- **Async ingestion** — move document processing to a background job so uploads return instantly
- **More file types** — PPTX, XLSX, HTML, EPUB
- **Billing** — Stripe integration, pro tier with higher limits
- **Better PDF parsing** — support for scanned PDFs (OCR)
- **ENTITY → ENTITY edges** — co-occurrence graph for richer traversal
