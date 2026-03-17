-- Vector similarity search function for retrieval
create or replace function match_chunks(
  query_embedding vector(1536),
  match_count int default 6,
  filter_doc_ids uuid[] default '{}',
  filter_user_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  filename text,
  content text,
  chunk_index int,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.document_id,
    d.filename,
    c.content,
    c.chunk_index,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  where
    c.document_id = any(filter_doc_ids)
    and d.user_id = filter_user_id
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
