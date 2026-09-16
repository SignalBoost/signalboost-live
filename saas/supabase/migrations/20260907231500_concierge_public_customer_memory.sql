-- COS-owned durable continuity for authenticated PUBLIC Concierge users.
-- This table is intentionally separate from generic assistant history, Saved User Memory,
-- Enterprise Memory, and owner/admin COS history. Only server-side public-delivery COS code writes it.

create table if not exists public.concierge_customer_turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  turn_fingerprint text not null,
  user_message text not null,
  assistant_reply text not null,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(user_message, '') || ' ' || coalesce(assistant_reply, ''))
  ) stored,
  created_at timestamptz not null default now(),
  constraint concierge_customer_turns_user_fingerprint_key unique (user_id, turn_fingerprint),
  constraint concierge_customer_turns_user_message_length check (char_length(user_message) <= 4000),
  constraint concierge_customer_turns_assistant_reply_length check (char_length(assistant_reply) <= 4000)
);

create index if not exists concierge_customer_turns_user_created_idx
  on public.concierge_customer_turns (user_id, created_at desc);

create index if not exists concierge_customer_turns_search_idx
  on public.concierge_customer_turns using gin (search_vector);

alter table public.concierge_customer_turns enable row level security;

-- Authenticated users may inspect/delete only their own public Concierge history. Direct client
-- inserts/updates are deliberately not granted: COS writes through the server service role so a
-- browser cannot manufacture remembered authority or another user's history.
drop policy if exists concierge_customer_turns_select_own on public.concierge_customer_turns;
create policy concierge_customer_turns_select_own
  on public.concierge_customer_turns
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists concierge_customer_turns_delete_own on public.concierge_customer_turns;
create policy concierge_customer_turns_delete_own
  on public.concierge_customer_turns
  for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.concierge_customer_turns from anon;
revoke insert, update on table public.concierge_customer_turns from authenticated;
grant select, delete on table public.concierge_customer_turns to authenticated;
