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
-- BOOTSTRAP NOTE
-- Run this once in every Supabase project that the Console Hub SQL Editor
-- should control. The final NOTIFY refreshes PostgREST's schema cache so the
-- RPC becomes available immediately after creation.

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
  v_detect := regexp_replace(query, '--[^\n]*', '', 'g');
  v_detect := regexp_replace(v_detect, '/\*.*?\*/', '', 'g');
  v_first  := lower(coalesce(substring(v_detect from '[a-zA-Z]+'), ''));

  if v_first in ('select', 'with', 'values', 'table', 'show', 'explain') then
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', query)
      into v_result;
    return v_result;
  end if;

  execute query;
  get diagnostics v_rows = row_count;
  return jsonb_build_object(
    'ok', true,
    'command', upper(v_first),
    'rows_affected', v_rows
  );

exception when others then
  return jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE);
end;
$$;

revoke all on function public.hub_exec_sql(text) from public;
grant execute on function public.hub_exec_sql(text) to service_role;

-- Supabase PostgREST caches function signatures. Refresh it so a newly-created
-- RPC is visible to /rest/v1/rpc/hub_exec_sql without waiting for cache expiry.
notify pgrst, 'reload schema';
