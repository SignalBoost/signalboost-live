-- Deterministic claim resolution for COS Council objective outcomes.
--
-- A model may pre-register a bounded machine-checkable prediction before the outcome exists, but
-- only objective facts resolve it. Council agreement, model confidence, and semantic similarity
-- never participate in the resolution or credibility update.

alter table public.cos_council_sessions
  add column if not exists cognitive_skill_refs jsonb not null default '{}'::jsonb,
  add column if not exists objective_claim_resolution_count integer not null default 0 check (objective_claim_resolution_count >= 0),
  add column if not exists objective_role_score_count integer not null default 0 check (objective_role_score_count >= 0);

create table if not exists public.cos_council_claim_resolutions (
  id uuid primary key default gen_random_uuid(),
  outcome_id uuid not null references public.cos_council_objective_outcomes(id) on delete cascade,
  session_id uuid not null references public.cos_council_sessions(id) on delete cascade,
  opinion_id uuid not null references public.cos_council_opinions(id) on delete cascade,
  role text not null check (role in ('architect','sre','database','security','business','skeptic')),
  claim_index integer not null check (claim_index >= 0),
  verdict text not null check (verdict in ('supported','refuted')),
  fact_path text not null,
  operator text not null check (operator in ('eq','neq','gt','gte','lt','lte')),
  expected jsonb not null,
  actual jsonb not null,
  created_at timestamptz not null default now(),
  unique(outcome_id, opinion_id, claim_index)
);

create index if not exists cos_council_claim_resolutions_session_idx
  on public.cos_council_claim_resolutions(session_id, created_at desc);
create index if not exists cos_council_claim_resolutions_role_idx
  on public.cos_council_claim_resolutions(session_id, role, created_at desc);

create table if not exists public.cos_council_role_objective_scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cos_council_sessions(id) on delete cascade,
  outcome_id uuid not null references public.cos_council_objective_outcomes(id) on delete cascade,
  role text not null check (role in ('architect','sre','database','security','business','skeptic')),
  problem_class text not null,
  verdict text not null check (verdict in ('supported','refuted')),
  resolution_count integer not null check (resolution_count > 0),
  source_ref text not null,
  skill_keys jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(session_id, role)
);

create index if not exists cos_council_role_objective_scores_created_idx
  on public.cos_council_role_objective_scores(created_at desc);

alter table public.cos_council_claim_resolutions enable row level security;
alter table public.cos_council_role_objective_scores enable row level security;

comment on table public.cos_council_claim_resolutions is
  'Mechanical comparisons between pre-registered Council predictions and exact objective facts. No model judges these rows.';
comment on table public.cos_council_role_objective_scores is
  'At most one automatic predictive-reliability score per Council role/session. Requires every registered machine prediction for the role to resolve unanimously from one objective outcome.';
comment on column public.cos_council_sessions.cognitive_skill_refs is
  'Exact [SK#] to durable cognitive skill-key mapping captured from the governed prompt for evidence-safe production-success attribution.';

create or replace function public.cos_record_council_objective_role_score(
  p_session_id uuid,
  p_outcome_id uuid,
  p_role text,
  p_verdict text,
  p_resolution_count integer,
  p_skill_keys jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problem_class text;
  v_outcome_session uuid;
  v_source_ref text;
  v_prediction_count integer := 0;
  v_resolution_count integer := 0;
  v_distinct_verdicts integer := 0;
  v_inserted_id uuid;
  v_gap_id uuid;
begin
  if p_role not in ('architect','sre','database','security','business','skeptic') then
    raise exception 'unsupported Council role: %', p_role using errcode = '22023';
  end if;
  if p_verdict not in ('supported','refuted') then
    raise exception 'unsupported Council objective role verdict: %', p_verdict using errcode = '22023';
  end if;
  if p_resolution_count < 1 then
    raise exception 'Council objective role score requires at least one resolved prediction' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_skill_keys, '[]'::jsonb)) <> 'array' then
    raise exception 'Council objective skill keys must be a JSON array' using errcode = '22023';
  end if;

  select problem_class into v_problem_class
    from public.cos_council_sessions
   where id = p_session_id
   for update;
  if not found then
    raise exception 'Council session % not found', p_session_id using errcode = 'P0002';
  end if;

  select session_id, source_ref
    into v_outcome_session, v_source_ref
    from public.cos_council_objective_outcomes
   where id = p_outcome_id;
  if not found then
    raise exception 'Council objective outcome % not found', p_outcome_id using errcode = 'P0002';
  end if;
  if v_outcome_session is distinct from p_session_id then
    raise exception 'objective outcome % is not bound to Council session %', p_outcome_id, p_session_id using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.cos_council_opinions
     where session_id = p_session_id and role = p_role
  ) then
    raise exception 'role % did not produce an opinion in Council session %', p_role, p_session_id using errcode = '22023';
  end if;

  select count(*) into v_prediction_count
    from public.cos_council_opinions o
    cross join lateral jsonb_array_elements(o.claims) as c(claim)
   where o.session_id = p_session_id
     and o.role = p_role
     and jsonb_typeof(c.claim->'machinePrediction') = 'object';

  select count(*), count(distinct verdict)
    into v_resolution_count, v_distinct_verdicts
    from public.cos_council_claim_resolutions
   where outcome_id = p_outcome_id
     and session_id = p_session_id
     and role = p_role;

  if v_prediction_count = 0 then
    raise exception 'role % has no pre-registered machine predictions', p_role using errcode = '22023';
  end if;
  if v_resolution_count <> v_prediction_count or v_resolution_count <> p_resolution_count then
    raise exception 'role % predictions are not fully resolved by objective outcome %', p_role, p_outcome_id using errcode = '22023';
  end if;
  if v_distinct_verdicts <> 1 or not exists (
    select 1 from public.cos_council_claim_resolutions
     where outcome_id = p_outcome_id
       and session_id = p_session_id
       and role = p_role
       and verdict = p_verdict
  ) then
    raise exception 'role % objective predictions are mixed or do not match verdict %', p_role, p_verdict using errcode = '22023';
  end if;

  insert into public.cos_council_role_objective_scores(
    session_id, outcome_id, role, problem_class, verdict, resolution_count, source_ref, skill_keys
  ) values (
    p_session_id, p_outcome_id, p_role, v_problem_class, p_verdict, p_resolution_count,
    left(v_source_ref, 1000), coalesce(p_skill_keys, '[]'::jsonb)
  )
  on conflict (session_id, role) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    return jsonb_build_object('ok', true, 'inserted', false, 'role', p_role, 'verdict', p_verdict);
  end if;

  insert into public.cos_council_member_credibility(
    role, problem_class, verified_cases, correct_cases, last_verified_at, metadata, updated_at
  ) values (
    p_role,
    v_problem_class,
    1,
    case when p_verdict = 'supported' then 1 else 0 end,
    now(),
    jsonb_build_object(
      'last_source_class', 'deterministic_claim_resolution',
      'last_source_ref', left(v_source_ref, 1000),
      'last_verdict', p_verdict,
      'last_outcome_id', p_outcome_id
    ),
    now()
  )
  on conflict (role, problem_class) do update set
    verified_cases = public.cos_council_member_credibility.verified_cases + 1,
    correct_cases = public.cos_council_member_credibility.correct_cases + excluded.correct_cases,
    last_verified_at = excluded.last_verified_at,
    metadata = coalesce(public.cos_council_member_credibility.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  update public.cos_council_sessions
     set objective_role_score_count = objective_role_score_count + 1
   where id = p_session_id;

  -- A refuted prediction is a real learning signal, but it is not proof that any cited skill is bad.
  -- Route it into the existing gap-driven learning lifecycle instead of weakening/quarantining skills.
  if p_verdict = 'refuted' then
    update public.cos_learning_gaps
       set repeated_count = repeated_count + 1,
           last_seen_at = now(),
           status = case when status = 'resolved' then 'pending' else status end,
           resolved_at = null,
           escalation_reason = 'deterministic_council_prediction_refuted'
     where id = (
       select id from public.cos_learning_gaps
        where task_id = 'council-objective:' || p_role
          and subject = v_problem_class
        order by last_seen_at desc
        limit 1
     )
     returning id into v_gap_id;

    if v_gap_id is null then
      insert into public.cos_learning_gaps(
        task_id, subject, question, capability, confidence, escalation_reason, repeated_count, status, last_seen_at
      ) values (
        'council-objective:' || p_role,
        v_problem_class,
        left('Re-evaluate ' || p_role || ' predictions for ' || v_problem_class || ' using deterministic outcome evidence; strengthen discriminating observables and falsifiers.', 4000),
        'general_reasoning',
        0,
        'deterministic_council_prediction_refuted',
        1,
        'pending',
        now()
      ) returning id into v_gap_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'inserted', true,
    'role', p_role,
    'verdict', p_verdict,
    'problem_class', v_problem_class,
    'learning_gap_id', v_gap_id
  );
end;
$$;

revoke all on function public.cos_record_council_objective_role_score(uuid,uuid,text,text,integer,jsonb) from public;
revoke all on function public.cos_record_council_objective_role_score(uuid,uuid,text,text,integer,jsonb) from anon;
revoke all on function public.cos_record_council_objective_role_score(uuid,uuid,text,text,integer,jsonb) from authenticated;
grant execute on function public.cos_record_council_objective_role_score(uuid,uuid,text,text,integer,jsonb) to service_role;
