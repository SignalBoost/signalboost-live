-- ============================================================
-- Migration: 20260620_audit_credit_topup
-- Adds audit_credits column, increment function, and
-- idempotency table for Stripe credit-pack webhooks.
--
-- Run via: supabase db push  OR  paste into Supabase SQL Editor.
-- ============================================================

-- 1. Add audit_credits column to subscriptions
alter table subscriptions
  add column if not exists audit_credits integer not null default 0;

-- 2. Create or replace the upsert/increment function
--    Called by the webhook handler on every audit_credit_topup checkout.
--    security definer so the anon/service role cannot bypass RLS on subscriptions.
create or replace function increment_audit_credits(
  target_user_id uuid,
  add_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  if add_amount is null or add_amount <= 0 then
    raise exception 'increment_audit_credits: add_amount must be a positive integer';
  end if;

  insert into subscriptions (user_id, plan, audit_credits)
  values (target_user_id, 'free', add_amount)
  on conflict (user_id) do update
    set audit_credits = coalesce(subscriptions.audit_credits, 0) + excluded.audit_credits,
        updated_at    = now()
  returning audit_credits into new_balance;

  return new_balance;
end;
$$;

-- 3. Lock down function permissions
--    Only service_role (used by the webhook route server-side) may call this.
--    The public/anon role cannot increment credits directly.
revoke all on function increment_audit_credits(uuid, integer) from public;
grant execute on function increment_audit_credits(uuid, integer) to service_role;

-- 4. Idempotency table — prevents double-crediting on Stripe retry events
create table if not exists stripe_processed_events (
  event_id     text primary key,
  processed_at timestamptz not null default now()
);

-- 5. RLS: only service_role may read/write this table
alter table stripe_processed_events enable row level security;

-- 6. Index for TTL-style cleanup queries (prune old events periodically)
create index if not exists idx_stripe_processed_events_processed_at
  on stripe_processed_events (processed_at);

-- ============================================================
-- Verification query (run after applying):
--   select
--     (select count(*) from information_schema.columns
--        where table_name = 'subscriptions' and column_name = 'audit_credits') as has_column,
--     (select count(*) from pg_proc where proname = 'increment_audit_credits') as has_function,
--     (select count(*) from information_schema.tables
--        where table_name = 'stripe_processed_events') as has_table;
--   Expected: has_column=1, has_function=1, has_table=1
-- ============================================================
