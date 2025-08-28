-- Chat schema: sessions + messages with RLS
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id bigserial primary key,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('system','user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Triggers to update session updated_at
create or replace function public.touch_chat_session() returns trigger as $$
begin
  update public.chat_sessions set updated_at = now() where id = new.session_id;
  return new;
end; $$ language plpgsql security definer;

drop trigger if exists trg_touch_chat_session on public.chat_messages;
create trigger trg_touch_chat_session
after insert on public.chat_messages
for each row execute function public.touch_chat_session();

-- RLS
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

do $do$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_sessions' and policyname = 'chat_sessions_owner'
  ) then
    execute $sql$ create policy "chat_sessions_owner" on public.chat_sessions
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id) $sql$;
  end if;
end $do$;

do $do$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'chat_messages_owner'
  ) then
    execute $sql$ create policy "chat_messages_owner" on public.chat_messages
      for all
      using (exists (select 1 from public.chat_sessions s where s.id = session_id and s.user_id = auth.uid()))
      with check (exists (select 1 from public.chat_sessions s where s.id = session_id and s.user_id = auth.uid())) $sql$;
  end if;
end $do$;

-- Helper view: sessions with last message
create or replace view public.chat_sessions_with_last as
select s.*,
  (select m.content from public.chat_messages m where m.session_id = s.id order by m.created_at desc limit 1) as last_message
from public.chat_sessions s
where s.user_id = auth.uid();


