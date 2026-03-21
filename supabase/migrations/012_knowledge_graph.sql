-- Knowledge graph: entities and chunk→entity edges
--
-- Design decisions:
--   - entities are scoped per user (user_id) — no cross-user leakage
--   - deduplication by (user_id, name): same entity name = same node
--   - chunk_entities is a junction table (CHUNK → ENTITY edges)
--   - CHUNK → DOCUMENT edge is already implicit via chunks.document_id FK
--   - ON DELETE CASCADE ensures full cleanup when documents/chunks are removed

create table public.entities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,           -- normalized (lowercased) entity name
  type        text not null,           -- 'person' | 'place' | 'organization' | 'concept'
  created_at  timestamptz not null default now(),

  -- Deduplicate entities per user by name
  unique (user_id, name)
);

create index idx_entities_user_id on public.entities(user_id);
create index idx_entities_type    on public.entities(type);

alter table public.entities enable row level security;

create policy "Users can read own entities"
  on public.entities for select
  using (user_id = auth.uid());

-- Junction table: CHUNK → ENTITY edges
create table public.chunk_entities (
  chunk_id    uuid not null references public.chunks(id)   on delete cascade,
  entity_id   uuid not null references public.entities(id) on delete cascade,
  primary key (chunk_id, entity_id)
);

create index idx_chunk_entities_entity_id on public.chunk_entities(entity_id);
create index idx_chunk_entities_chunk_id  on public.chunk_entities(chunk_id);

alter table public.chunk_entities enable row level security;

create policy "Users can read own chunk_entities"
  on public.chunk_entities for select
  using (
    exists (
      select 1 from public.chunks c
        join public.documents d on d.id = c.document_id
      where c.id = chunk_entities.chunk_id
        and d.user_id = auth.uid()
    )
  );
