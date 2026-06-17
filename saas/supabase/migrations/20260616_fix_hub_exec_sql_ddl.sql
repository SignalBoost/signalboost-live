-- saas/supabase/migrations/20260616_fix_hub_exec_sql_ddl.sql
--
-- BUG FIX: hub_exec_sql could only run row-returning queries.
--
-- The old definition wrapped EVERY statement as a subquery
--   select coalesce(jsonb_agg(t), '[]') from ( <your sql> ) t
-- which is only valid for SELECT. Any DDL/DML (create/alter/drop/insert/…)
-- landed inside that wrapper and Postgres failed at the first keyword:
--   "syntax error at or near \"create\""
-- So the Hub Console SQL Editor and Run Migration cards were read-only in
-- practice, even though run_migration is meant to apply migrations.
--
-- This replacement keeps the exact legacy behavior for queries that return
-- rows (so the SQL Editor card still gets a JSON array back), and runs
-- everything else raw, returning a small status object instead.
--
-- ── BOOTSTRAP NOTE ──────────────────────────────────────────────────────────
-- This file is itself DDL (create or replace function), so it cannot be
-- installed through the broken card. Run THIS one time in the Supabase
-- dashboard SQL editor (project qpblefwtnbivuusxmabv). After it succeeds, the
-- Hub Console SQL Editor / Run Migration cards will run DDL normally — including
-- 20260616_infrastructure_prs.sql.

create or replace function public.hub_exec_sql(query text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_detect text;
  v_first  text;
  v_result jsonb;
  v_rows   bigint;
begin
  -- Detect the leading keyword on a comment-stripped COPY (the original `query`
  -- is executed untouched — Postgres handles its comments fine).
  v_detect := regexp_replace(query, '--[^\n]*', '', 'g');     -- line comments
  v_detect := regexp_replace(v_detect, '/\*.*?\*/', '', 'g'); -- block comments
  v_first  := lower(coalesce(substring(v_detect from '[a-zA-Z]+'), ''));

  -- Row-returning statements → aggregate to a JSON array (legacy contract that
  -- the SQL Editor card and any list-style actions depend on).
  if v_first in ('select', 'with', 'values', 'table', 'show', 'explain') then
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', query)
      into v_result;
    return v_result;
  end if;

  -- Everything else (create / alter / drop / insert / update / delete / grant /
  -- comment / truncate / …) runs raw. EXECUTE accepts multi-statement strings,
  -- so a full migration with several statements applies in one call.
  execute query;
  get diagnostics v_rows = row_count;
  return jsonb_build_object(
    'ok', true,
    'command', upper(v_first),
    'rows_affected', v_rows
  );

exception when others then
  -- The route checks for an `error` key and surfaces it as a failed action.
  return jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE);
end;
$$;

-- Only the service role (used by the gated, owner/admin-only hub action route)
-- may call this. Never expose it to anon/authenticated.
revoke all on function public.hub_exec_sql(text) from public;
grant execute on function public.hub_exec_sql(text) to service_role;
