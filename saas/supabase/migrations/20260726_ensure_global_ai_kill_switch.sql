-- saas/supabase/migrations/20260726_ensure_global_ai_kill_switch.sql
--
-- WHY THIS EXISTS. saas/proxy.ts blocks every request under /api/autonomous-supervisor/,
-- /api/cron/, /api/webhook/ and /api/internal/supervisor/ unless it can read
-- system_status.ai_autonomous_execution_enabled = true using the ANON key. It fails closed:
-- a missing table, a missing row, an unreadable row, or any error all mean "blocked".
--
-- Meanwhile /dashboard/supervisor computes `ai_autonomous_execution_enabled !== false`, so a
-- MISSING row reads as undefined and the banner shows "AI AUTONOMY ACTIVE". The two
-- disagree in exactly the case that matters, which is why the page looked healthy while
-- every supervisor webhook was getting a 503.
--
-- Everything below is idempotent. Running it twice changes nothing.

-- ── STEP 1 — DIAGNOSE (corrected) ──────────────────────────────────────────
-- The earlier version of this query referenced public.system_status inside subqueries.
-- Postgres resolves every relation at PARSE time, so it errored with
-- `relation "public.system_status" does not exist` — the exact case it was written to
-- detect. to_regclass on its own is the only form that survives a missing table.
select to_regclass('public.system_status') as table_ref;

-- table_ref is NULL  -> the table does not exist. Run STEP 2.
-- table_ref is a name -> the table exists; run STEP 1B for the row.

-- STEP 1B — only run this if STEP 1 returned a name, not NULL.
-- select id, ai_autonomous_execution_enabled, updated_at
--   from public.system_status where id = 'global';


-- ── STEP 2 — CREATE THE TABLE AND THE ROW (safe to re-run) ──────────────────
create table if not exists public.system_status (
  id text primary key default 'global' check (id = 'global'),
  ai_autonomous_execution_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.system_status (id, ai_autonomous_execution_enabled)
values ('global', true)
on conflict (id) do nothing;

alter table public.system_status enable row level security;

-- The middleware reads this with the ANON key. Without this policy the read returns nothing
-- and the proxy fails closed — the switch would look on and behave off.
drop policy if exists "Authenticated users can read global system status" on public.system_status;
create policy "Authenticated users can read global system status"
  on public.system_status for select
  to anon, authenticated
  using (true);

grant select on public.system_status to anon, authenticated;
grant update on public.system_status to authenticated;
revoke insert, delete on public.system_status from authenticated;


-- ── STEP 3 — ONLY IF STEP 1 SHOWED autonomy_enabled = false ─────────────────
-- Turning autonomy back on. Skip this if step 1 already showed true.
update public.system_status
   set ai_autonomous_execution_enabled = true
 where id = 'global'
   and ai_autonomous_execution_enabled is distinct from true;


-- ── STEP 4 — VERIFY. Expect exactly one row, enabled = true. ────────────────
select id, ai_autonomous_execution_enabled, updated_at
  from public.system_status
 where id = 'global';
