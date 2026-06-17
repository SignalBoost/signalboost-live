// saas/lib/hub/db-bootstrap-sql.ts
//
// Canonical SQL the hub installs to repair/own its database surface. These are
// byte-for-byte the committed migrations (20260616_fix_hub_exec_sql_ddl.sql and
// 20260616_infrastructure_prs.sql). Keeping them here lets the platform install
// them itself via the Supabase Management API — no dashboard, no chicken-and-egg.
//
// All statements are idempotent (create or replace / if not exists), so the
// bootstrap route is safe to run any number of times.

export const SQL_HUB_EXEC_SQL_DDL_FIX = `
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
  v_detect := regexp_replace(query, '--[^\\n]*', '', 'g');
  v_detect := regexp_replace(v_detect, '/\\*.*?\\*/', '', 'g');
  v_first  := lower(coalesce(substring(v_detect from '[a-zA-Z]+'), ''));

  if v_first in ('select', 'with', 'values', 'table', 'show', 'explain') then
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', query)
      into v_result;
    return v_result;
  end if;

  execute query;
  get diagnostics v_rows = row_count;
  return jsonb_build_object('ok', true, 'command', upper(v_first), 'rows_affected', v_rows);

exception when others then
  return jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE);
end;
$$;

revoke all on function public.hub_exec_sql(text) from public;
grant execute on function public.hub_exec_sql(text) to service_role;
`.trim()

export const SQL_INFRASTRUCTURE_PRS_TABLE = `
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
`.trim()

/** Ordered install steps for the self-heal route. */
export const BOOTSTRAP_STEPS: { id: string; label: string; sql: string }[] = [
  { id: 'hub_exec_sql_ddl_fix', label: 'Upgrade hub_exec_sql to support DDL', sql: SQL_HUB_EXEC_SQL_DDL_FIX },
  { id: 'infrastructure_prs_table', label: 'Create infrastructure_prs table', sql: SQL_INFRASTRUCTURE_PRS_TABLE },
]
