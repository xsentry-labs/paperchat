-- Agent activity logs — high-level execution traces per query
--
-- Stores WHAT happened (steps, retrieved chunks, entities used) but NOT
-- chain-of-thought. Kept as structured JSONB for easy querying.
-- conversation_id is nullable: logs remain if a conversation is deleted.

create table public.agent_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  conversation_id   uuid references public.conversations(id) on delete set null,

  user_query        text not null,

  -- Chunks that were retrieved for this query
  retrieved_chunks  jsonb not null default '[]',
  -- [{id, documentId, filename, page, similarity}]

  -- Entities extracted from retrieved chunks
  entities_used     jsonb not null default '[]',
  -- [{name, type}]

  -- Ordered list of pipeline steps with timing
  steps             jsonb not null default '[]',
  -- [{step: 'retrieval'|'graph_expansion'|'generation', duration_ms, meta}]

  final_output      text,             -- the assistant's final response text
  model_used        text,             -- which model was used
  created_at        timestamptz not null default now()
);

create index idx_agent_logs_user_id         on public.agent_logs(user_id);
create index idx_agent_logs_conversation_id on public.agent_logs(conversation_id);
create index idx_agent_logs_created_at      on public.agent_logs(created_at desc);

alter table public.agent_logs enable row level security;

create policy "Users can read own agent logs"
  on public.agent_logs for select
  using (user_id = auth.uid());
