create type public.document_status as enum ('pending', 'processing', 'ready', 'error');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  status public.document_status not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "Users can read own documents"
  on public.documents for select
  using (auth.uid() = user_id);

create policy "Users can insert own documents"
  on public.documents for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own documents"
  on public.documents for delete
  using (auth.uid() = user_id);

create index idx_documents_user_id on public.documents(user_id);
