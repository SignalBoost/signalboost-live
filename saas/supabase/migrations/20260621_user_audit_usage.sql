-- saas/supabase/migrations/20260621_user_audit_usage.sql
-- Per-call AI usage ledger: tracks input/output/cache tokens and an estimated
-- USD cost for every metered model call, so external-user consumption can be
-- attributed, billed, or throttled. Token counts are the source of truth;
-- cost_usd is a best-effort estimate from the rate table in lib/ai/usage.ts.

create table if not exists user_audit_usage (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid references auth.users(id) on delete set null,
  feature                text not null,                      -- e.g. 'audit.executive-summary'
  model                  text not null,                      -- e.g. 'claude-sonnet-4-6'
  input_tokens           integer not null default 0,
  output_tokens          integer not null default 0,
  cache_creation_tokens  integer not null default 0,         -- tokens written to the prompt cache
  cache_read_tokens      integer not null default 0,         -- tokens served from cache (the savings)
  cost_usd               numeric(12,6) not null default 0,
  created_at             timestamptz not null default now()
);

create index if not exists user_audit_usage_user_idx    on user_audit_usage (user_id, created_at desc);
create index if not exists user_audit_usage_feature_idx on user_audit_usage (feature, created_at desc);

alter table user_audit_usage enable row level security;

-- Reads: a user sees only their own usage. Writes happen via the service-role
-- key (server-side), which bypasses RLS — no insert policy is granted to clients.
create policy "Users read own audit usage"
  on user_audit_usage for select
  using (auth.uid() = user_id);
