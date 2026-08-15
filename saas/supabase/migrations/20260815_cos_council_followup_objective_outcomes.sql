-- Follow-up objective evidence must inherit the exact Council session from the objective event that
-- created the external operation. Re-matching only by incident_id is unsafe because an incident
-- fingerprint can recur later with new evidence.

create or replace function public.cos_record_council_followup_objective_outcome(
  p_parent_outcome_id uuid,
  p_source_class text,
  p_source_ref text,
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
  v_correlation_kind text;
  v_correlation_value text;
  v_outcome_id uuid;
  v_inserted boolean := false;
begin
  if p_source_class not in ('deterministic_tool','production_outcome','authoritative_record') then
    raise exception 'unsupported Council follow-up outcome source class: %', p_source_class using errcode = '22023';
  end if;
  if p_outcome_status not in ('success','failure','observed') then
    raise exception 'unsupported Council follow-up outcome status: %', p_outcome_status using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_source_ref, '')), '') is null then
    raise exception 'Council follow-up outcome source_ref is required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_summary, '')), '') is null then
    raise exception 'Council follow-up outcome summary is required' using errcode = '22023';
  end if;
  if p_source_ref ~* '^(model|council|llm|consensus|frontier_teacher):' then
    raise exception 'model/Council output cannot be an objective outcome source' using errcode = '22023';
  end if;

  select session_id, correlation_kind, correlation_value
    into v_session_id, v_correlation_kind, v_correlation_value
    from public.cos_council_objective_outcomes
   where id = p_parent_outcome_id;

  if not found then
    raise exception 'parent Council objective outcome not found: %', p_parent_outcome_id using errcode = '22023';
  end if;

  -- The follow-up is a new immutable row, but session/correlation identity is inherited from the
  -- exact parent outcome. No fuzzy lookup and no "latest incident" rematching occurs here.
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
    v_correlation_kind,
    v_correlation_value,
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
       and correlation_kind = v_correlation_kind
       and correlation_value = v_correlation_value
     limit 1;
  end if;

  if v_session_id is not null then
    select problem_class into v_problem_class
      from public.cos_council_sessions
     where id = v_session_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'outcome_id', v_outcome_id,
    'parent_outcome_id', p_parent_outcome_id,
    'matched_session_id', v_session_id,
    'matched_problem_class', v_problem_class,
    'correlation_kind', v_correlation_kind,
    'correlation_value', v_correlation_value
  );
end;
$$;

revoke all on function public.cos_record_council_followup_objective_outcome(uuid,text,text,text,text,jsonb) from public;
revoke all on function public.cos_record_council_followup_objective_outcome(uuid,text,text,text,text,jsonb) from anon;
revoke all on function public.cos_record_council_followup_objective_outcome(uuid,text,text,text,text,jsonb) from authenticated;
grant execute on function public.cos_record_council_followup_objective_outcome(uuid,text,text,text,text,jsonb) to service_role;
