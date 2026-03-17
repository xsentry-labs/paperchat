# paperchat

Chat with your documents. Upload PDFs, text files, markdown, or Word docs and ask questions — get cited answers powered by AI.

Built with Next.js 15, Supabase, pgvector, and OpenRouter.

## Features

- **Document upload & processing** — drag in a PDF, DOCX, TXT, or MD file. It gets parsed, chunked, and embedded automatically.
- **RAG-powered chat** — ask questions and get answers grounded in your documents, with inline `[1]` citations linking back to source passages.
- **Multiple AI models** — switch between GPT-4.1 mini (fast), Claude Haiku 4.5 (accurate), or Gemini 2.5 Flash (large context) via OpenRouter.
- **Citation cards** — every answer includes source cards showing the document name, page, and relevant quote.
- **File explorer** — sidebar with live status dots (amber = processing, green = ready, red = failed).
- **Rate limiting** — 50 queries/day on the free tier.

## Getting started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)
- An [OpenAI](https://platform.openai.com) API key (for embeddings)
- An [OpenRouter](https://openrouter.ai) API key (for chat models)

### Setup

1. Clone the repo and install dependencies:

```bash
npm install
```

2. Copy `.env.local` and fill in your keys:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-key
OPENROUTER_API_KEY=your-openrouter-key
```

3. Run the SQL migrations in order (1-8) in the Supabase SQL Editor. They're in `supabase/migrations/`.

4. Start the dev server:

```bash
npm run dev
```

5. Open [localhost:3000](http://localhost:3000), sign up, upload a document, and start chatting.

### Deploy

Deploy to Vercel — set the same env vars in your Vercel project settings. Point a custom domain at it if you want.

## Stack

- **Next.js 15** — app router, server components, API routes
- **Supabase** — auth, Postgres, pgvector, file storage
- **OpenAI** — text-embedding-3-small for document embeddings
- **OpenRouter** — multi-model LLM access (GPT-4.1 mini, Claude Haiku 4.5, Gemini 2.5 Flash)
- **Vercel AI SDK** — streaming chat responses
- **Tailwind CSS v4** — dark theme UI

## Next steps

- **Testing & review** — end-to-end test the full flow, fix edge cases
- **Deploy** — push to Vercel, connect custom domain, link from main xsentry labs website
- **Conversation history** — reuse existing conversations instead of always creating new ones
- **Multi-doc conversations** — chat across multiple documents at once
- **Better PDF parsing** — page-level text extraction, support for scanned PDFs
- **More file types** — PPTX, XLSX, HTML, EPUB
- **Billing** — Stripe integration, pro tier with higher limits
- **Mobile responsive** — collapsible sidebar, touch-friendly UI
