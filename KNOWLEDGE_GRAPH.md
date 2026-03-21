# Hybrid Knowledge Graph System

## How Components Connect

```
Upload → Parse → Chunk → [Embed] → [Encrypt] → Store
                                ↓
                        Entity Extraction
                                ↓
                        Graph Edges (chunk_entities)

Query → Embed → pgvector search → top-k chunks
                                        ↓
                                Get entities (graph)
                                        ↓
                                Expand via graph → extra chunks
                                        ↓
                                Merged context → LLM → Stream
                                        ↓
                                Agent log written
```

## New Files

| File | Purpose |
|------|---------|
| `src/lib/encryption.ts` | AES-256-GCM encrypt/decrypt for chunk content |
| `src/lib/entities.ts` | Entity extraction using compromise.js NLP |
| `src/lib/graph.ts` | Graph CRUD (store/query entities and edges) |
| `src/lib/agent-logger.ts` | Write + read execution traces |
| `src/lib/models.ts` | Comprehensive model registry (15+ models) |
| `src/components/graph/KnowledgeGraph.tsx` | Canvas force-directed graph UI |
| `supabase/migrations/012_knowledge_graph.sql` | entities + chunk_entities tables |
| `supabase/migrations/013_agent_logs.sql` | agent_logs table |

## New API Endpoints

- `GET /api/graph` — graph nodes + edges for the authenticated user
- `GET /api/agent/logs` — paginated execution traces (`?limit=50&offset=0`)

## Configuration

```env
# Required for OpenAI models (embeddings + summaries always use this)
OPENAI_API_KEY=sk-...

# Optional: set to use OpenRouter and unlock all 15+ models
OPENROUTER_API_KEY=sk-or-...

# Optional: set to enable encryption at rest (default uses a dev placeholder)
ENCRYPTION_SECRET=your-random-32-char-secret
```

## Encryption

- Chunk content is encrypted with AES-256-GCM before storage
- Per-user key derived from: `SHA-256(userId + ENCRYPTION_SECRET)`
- Embeddings remain unencrypted (needed raw by pgvector)
- Backward compatible: existing plaintext chunks are read as-is

## Entity Extraction

Uses [compromise.js](https://compromisejs.com) — pure JavaScript, no API calls.

Extracts per chunk:
- **People** — proper names identified as persons
- **Places** — geographic names
- **Organizations** — companies, institutions
- **Concepts** — significant single-word nouns

Capped at 20 entities per chunk to avoid noise.

## Deletion Guarantees

When a document is deleted, PostgreSQL `ON DELETE CASCADE` automatically removes:
- All chunks (→ chunk_entities → entities if orphaned)
- All conversation history
- All agent logs referencing the conversation

Entities shared across multiple documents are preserved until all referencing chunks are gone.

## Knowledge Graph UI

Located at `/artifacts` → Graph tab. Click a node to highlight its connections.

Node colors:
- White — Document
- Blue — Person
- Green — Place
- Orange — Organization
- Purple — Concept
