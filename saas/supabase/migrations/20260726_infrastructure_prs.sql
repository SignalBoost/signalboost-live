-- saas/supabase/migrations/20260726_infrastructure_prs.sql
--
-- The infrastructure_prs table: what the self-healing supervisor writes when it stages a
-- repair, and the only table readiness counts as proof that pipeline has run.
--
-- WHY THIS FILE EXISTS. The DDL was already in the repository, but only as a TypeScript
-- constant — SQL_INFRASTRUCTURE_PRS_TABLE in saas/lib/hub/db-bootstrap-sql.ts, installed by
-- the platform's own bootstrap route through the Supabase Management API. That works for
-- SignalBoost and not for anyone else: a buyer standing up the Self-Healing Supervisor
-- portable in their own estate does not run SignalBoost's bootstrap route, so they had no
-- schema to apply. This file makes the table installable with nothing but a SQL client.
--
-- It also makes supabase/migrations/ tell the truth about it. The only other file naming this
-- table, 20260616_pending_infrastructure_prs.sql, is a Markdown design document that was saved
-- with a .sql extension and contains no SQL at all.
--
-- CANONICAL SOURCE. db-bootstrap-sql.ts remains the source the platform installs from. This
-- file is a faithful copy of the same statements. Every statement is idempotent, so applying
-- both in either order is safe and the two cannot drift into conflict — but if you change one,
-- change the other.
--
-- NOTE ON RLS. Row level security is enabled with NO policy, which is deliberate: it denies
-- every anon and authenticated request and leaves the table reachable only by the service role
-- the supervisor runs as. Do not add a permissive policy to "make it work" — staged repair
-- proposals carry diagnostic detail about the buyer's infrastructure and are not user-facing.
--
-- WHERE TO RUN. The native Supabase SQL editor runs this whole file as-is. The Hub Console SQL
-- card goes through hub_exec_sql, which handles one statement at a time — send the statements
-- separately there, without their trailing semicolons.

create table if not exists public.infrastructure_prs (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  merged_at        timestamptz,
  title            text not null,
  summary          text not null default '',
  status           text not null default 'open',
  risk             text not null default 'medium',
  steps            jsonb not null default '[]'::jsonb,
  results          jsonb not null default '[]'::jsonb,
  created_by       text,
  created_by_email text,
  approved_by      text,
  error            text,
  constraint infrastructure_prs_status_chk
    check (status in ('open','merging','merged','failed','closed')),
  constraint infrastructure_prs_risk_chk
    check (risk in ('low','medium','high'))
);

create index if not exists infrastructure_prs_status_idx
  on public.infrastructure_prs (status, created_at desc);

create index if not exists infrastructure_prs_created_idx
  on public.infrastructure_prs (created_at desc);

alter table public.infrastructure_prs enable row level security;
