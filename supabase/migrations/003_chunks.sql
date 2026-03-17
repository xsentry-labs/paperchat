-- Enable pgvector extension
create extension if not exists vector with schema extensions;

create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  chunk_index integer not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.chunks enable row level security;

create policy "Users can read chunks of own documents"
  on public.chunks for select
  using (
    exists (
      select 1 from public.documents
      where documents.id = chunks.document_id
        and documents.user_id = auth.uid()
    )
  );

create index idx_chunks_document_id on public.chunks(document_id);

-- HNSW index for similarity search
create index idx_chunks_embedding on public.chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
