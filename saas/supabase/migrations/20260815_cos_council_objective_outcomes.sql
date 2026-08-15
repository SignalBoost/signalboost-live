-- COS Council objective-outcome correlation and automatic evidence ingestion.
--
-- Objective outcomes are not specialist verdicts by themselves. They are durable, externally
-- observed facts linked to an exact execution/incident identifier. Specialist credibility still
-- changes only through cos_record_council_verified_outcome(...) when evidence can deterministically
-- resolve a participating role's claim.

alter table public.cos_council_sessions
  add column if not exists correlation_refs jsonb not null default '{}'::jsonb,
  add column if not exists objective_outcome_count integer not null default 0 check (objective_outcome_count >= 0),
  add column if not exists last_objective_outcome_at timestamptz;

create index if not exists cos_council_sessions_correlation_refs_idx
  on public.cos_council_sessions using gin (correlation_refs jsonb_path_ops);

create table if not exists public.cos_council_objective_outcomes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.cos_council_sessions(id) on delete set null,
  source_class text not null check (source_class in ('deterministic_tool','production_outcome','authoritative_record')),
  source_ref text not null,
  correlation_kind text not null check (correlation_kind in ('incident_id','trace_id','execution_id','recovery_key','deployment_id')),
  correlation_value text not null,
  outcome_status text not null check (outcome_status in ('success','failure','observed')),
  summary text not null,
  facts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(source_class, source_ref, correlation_kind, correlation_value)
);

create index if not exists cos_council_objective_outcomes_session_idx
  on public.cos_council_objective_outcomes(session_id, created_at desc);
create index if not exists cos_council_objective_outcomes_correlation_idx
  on public.cos_council_objective_outcomes(correlation_kind, correlation_value, created_at desc);
create index if not exists cos_council_objective_outcomes_status_idx
  on public.cos_council_objective_outcomes(outcome_status, created_at desc);

alter table public.cos_council_objective_outcomes enable row level security;

comment on table public.cos_council_objective_outcomes is
  'Objective non-Council outcomes correlated to exact incident/execution identifiers. Outcome existence alone never changes specialist credibility or answer confidence.';
comment on column public.cos_council_sessions.correlation_refs is
  'Stable identifiers extracted from the governed prompt (for example incident_id). Used only for exact objective-outcome correlation, never semantic inference.';

create or replace function public.cos_record_council_objective_outcome(
  p_source_class text,
  p_source_ref text,
  p_correlation_kind text,
  p_correlation_value text,
  p_outcome_status text,
  p_summary text,
  p_facts jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_problem_class text;
  v_outcome_id uuid;
  v_inserted boolean := false;
begin
  if p_source_class not in ('deterministic_tool','production_outcome','authoritative_record') then
    raise exception 'unsupported Council objective outcome source class: %', p_source_class using errcode = '22023';
  end if;
  if p_correlation_kind not in ('incident_id','trace_id','execution_id','recovery_key','deployment_id') then
    raise exception 'unsupported Council objective outcome correlation kind: %', p_correlation_kind using errcode = '22023';
  end if;
  if p_outcome_status not in ('success','failure','observed') then
    raise exception 'unsupported Council objective outcome status: %', p_outcome_status using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_source_ref, '')), '') is null then
    raise exception 'Council objective outcome source_ref is required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_correlation_value, '')), '') is null then
    raise exception 'Council objective outcome correlation value is required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_summary, '')), '') is null then
    raise exception 'Council objective outcome summary is required' using errcode = '22023';
  end if;
  if p_source_ref ~* '^(model|council|llm|consensus|frontier_teacher):' then
    raise exception 'model/Council output cannot be an objective outcome source' using errcode = '22023';
  end if;

  -- Exact identifier matching only. No semantic/fuzzy matching is allowed here because an outcome
  -- attached to the wrong Council session would corrupt future specialist reliability evidence.
  select id, problem_class
    into v_session_id, v_problem_class
    from public.cos_council_sessions
   where correlation_refs ->> p_correlation_kind = p_correlation_value
     and status in ('deliberated','verified')
   order by created_at desc
   limit 1;

  insert into public.cos_council_objective_outcomes (
    session_id,
    source_class,
    source_ref,
    correlation_kind,
    correlation_value,
    outcome_status,
    summary,
    facts
  ) values (
    v_session_id,
    p_source_class,
    left(p_source_ref, 1000),
    p_correlation_kind,
    left(p_correlation_value, 500),
    p_outcome_status,
    left(p_summary, 4000),
    coalesce(p_facts, '{}'::jsonb)
  )
  on conflict (source_class, source_ref, correlation_kind, correlation_value) do nothing
  returning id into v_outcome_id;

  v_inserted := v_outcome_id is not null;

  if v_inserted and v_session_id is not null then
    update public.cos_council_sessions set
      objective_outcome_count = objective_outcome_count + 1,
      last_objective_outcome_at = now()
    where id = v_session_id;
  end if;

  if not v_inserted then
    select id, session_id
      into v_outcome_id, v_session_id
      from public.cos_council_objective_outcomes
     where source_class = p_source_class
       and source_ref = p_source_ref
       and correlation_kind = p_correlation_kind
       and correlation_value = p_correlation_value
     limit 1;
    if v_session_id is not null then
      select problem_class into v_problem_class from public.cos_council_sessions where id = v_session_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'outcome_id', v_outcome_id,
    'matched_session_id', v_session_id,
    'matched_problem_class', v_problem_class
  );
end;
$$;

revoke all on function public.cos_record_council_objective_outcome(text,text,text,text,text,text,jsonb) from public;
revoke all on function public.cos_record_council_objective_outcome(text,text,text,text,text,text,jsonb) from anon;
revoke all on function public.cos_record_council_objective_outcome(text,text,text,text,text,text,jsonb) from authenticated;
grant execute on function public.cos_record_council_objective_outcome(text,text,text,text,text,text,jsonb) to service_role;
