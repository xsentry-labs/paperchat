create type public.chat_message_role as enum ('user', 'assistant');

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role public.chat_message_role not null,
  content text not null,
  sources jsonb,
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

create policy "Users can read messages of own conversations"
  on public.chat_messages for select
  using (
    exists (
      select 1 from public.conversations
      where conversations.id = chat_messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );

create policy "Users can insert messages into own conversations"
  on public.chat_messages for insert
  with check (
    exists (
      select 1 from public.conversations
      where conversations.id = chat_messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );

create index idx_chat_messages_conversation_id on public.chat_messages(conversation_id);
