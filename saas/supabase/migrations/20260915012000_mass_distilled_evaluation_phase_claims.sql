-- Durable one-shot reservations for mass-distilled independent-evaluation spend.
-- A claimed phase is never automatically released: an uncertain provider call must fail closed rather
-- than silently repeat paid endpoint or judge work under the same owner authorization.

create table if not exists public.cos_university_mass_distilled_evaluation_phase_claims (
  candidate_id text not null,
  artifact_hash text not null check (artifact_hash ~ '^[a-f0-9]{64}$'),
  phase text not null check (phase in ('initial','retention')),
  approval_event_key text not null,
  endpoint_calls_reserved integer not null check (endpoint_calls_reserved in (2,6)),
  judge_calls_reserved integer not null check (judge_calls_reserved in (1,3)),
  status text not null default 'claimed' check (status in ('claimed','completed')),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  authority_expanded boolean not null default false check (authority_expanded is false),
  primary key (candidate_id, artifact_hash, phase)
);

create index if not exists cos_mass_distilled_evaluation_phase_claim_status_idx
  on public.cos_university_mass_distilled_evaluation_phase_claims (status, claimed_at);

alter table public.cos_university_mass_distilled_evaluation_phase_claims enable row level security;
revoke all on table public.cos_university_mass_distilled_evaluation_phase_claims from public, anon, authenticated;
grant select, insert, update on table public.cos_university_mass_distilled_evaluation_phase_claims to service_role;

comment on table public.cos_university_mass_distilled_evaluation_phase_claims is
  'One-shot owner-authorized spend reservations for mass distilled initial and delayed-retention evaluation phases. Claimed phases fail closed after uncertainty and are never automatically reclaimed.';

create or replace function public.claim_cos_university_mass_distilled_evaluation_phase(
  p_candidate_id text,
  p_artifact_hash text,
  p_phase text
)
returns table (
  claimed boolean,
  endpoint_calls_reserved integer,
  judge_calls_reserved integer,
  approval_event_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_approval public.cos_university_learning_assurance_events%rowtype;
  v_endpoint_calls integer;
  v_judge_calls integer;
  v_inserted integer := 0;
  v_evidence jsonb;
  v_evidence_hash text;
  v_event_key text;
begin
  if p_candidate_id !~* '^mass:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[a-f0-9]{16}$' then
    raise exception 'mass_distilled_evaluation_phase_candidate_invalid';
  end if;
  if p_artifact_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'mass_distilled_evaluation_phase_artifact_invalid';
  end if;
  if p_phase not in ('initial','retention') then
    raise exception 'mass_distilled_evaluation_phase_invalid';
  end if;

  if p_phase = 'initial' then
    v_endpoint_calls := 6;
    v_judge_calls := 3;
  else
    v_endpoint_calls := 2;
    v_judge_calls := 1;
    if not exists (
      select 1
      from public.cos_university_mass_distilled_evaluation_phase_claims c
      where c.candidate_id = p_candidate_id
        and c.artifact_hash = lower(p_artifact_hash)
        and c.phase = 'initial'
        and c.status = 'completed'
    ) then
      raise exception 'mass_distilled_evaluation_initial_phase_not_completed';
    end if;
  end if;

  select e.* into v_approval
  from public.cos_university_learning_assurance_events e
  where e.event_type = 'fine_tune'
    and e.candidate_id = p_candidate_id
    and e.verifier = 'host_controller'
    and e.evidence->>'profile' = 'cos_distilled_independent_evaluation_authorization_v1'
    and e.evidence->>'claim' = 'distilled_independent_evaluation_approved'
    and e.evidence->>'candidateId' = p_candidate_id
    and lower(e.evidence->>'artifactHash') = lower(p_artifact_hash)
    and e.evidence->>'evaluationAuthorized' = 'true'
    and coalesce((e.evidence->>'maxEndpointCalls')::integer, 0) >= 8
    and coalesce((e.evidence->>'maxJudgeCalls')::integer, 0) >= 4
    and e.evidence->>'productionTrafficAuthorized' = 'false'
    and e.evidence->>'authorityExpanded' = 'false'
    and e.observed_at <= v_now
    and e.expires_at is not null
    and e.expires_at > v_now
  order by e.observed_at desc
  limit 1
  for share;

  if not found then
    raise exception 'mass_distilled_evaluation_phase_approval_missing_or_expired';
  end if;

  insert into public.cos_university_mass_distilled_evaluation_phase_claims (
    candidate_id, artifact_hash, phase, approval_event_key,
    endpoint_calls_reserved, judge_calls_reserved, status, claimed_at, authority_expanded
  ) values (
    p_candidate_id, lower(p_artifact_hash), p_phase, v_approval.event_key,
    v_endpoint_calls, v_judge_calls, 'claimed', v_now, false
  ) on conflict (candidate_id, artifact_hash, phase) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return query select false, v_endpoint_calls, v_judge_calls, v_approval.event_key;
    return;
  end if;

  v_evidence := jsonb_build_object(
    'profile','cos_mass_distilled_evaluation_phase_v1',
    'claim','mass_distilled_evaluation_phase_reserved',
    'candidateId',p_candidate_id,
    'artifactHash',lower(p_artifact_hash),
    'phase',p_phase,
    'approvalEventKey',v_approval.event_key,
    'endpointCallsReserved',v_endpoint_calls,
    'judgeCallsReserved',v_judge_calls,
    'automaticRetryAuthorized',false,
    'productionTrafficAuthorized',false,
    'authorityExpanded',false
  );
  v_evidence_hash := encode(extensions.digest(convert_to(v_evidence::text,'UTF8'),'sha256'),'hex');
  v_event_key := encode(extensions.digest(convert_to(
    'cos_mass_distilled_evaluation_phase_v1:reserved:' || p_candidate_id || ':' || lower(p_artifact_hash) || ':' || p_phase,
    'UTF8'
  ),'sha256'),'hex');
  insert into public.cos_university_learning_assurance_events (
    event_key,event_type,candidate_id,evidence_hash,evidence,verifier,observed_at
  ) values (
    v_event_key,'fine_tune',p_candidate_id,v_evidence_hash,v_evidence,'host_controller',v_now
  ) on conflict (event_key) do nothing;

  return query select true, v_endpoint_calls, v_judge_calls, v_approval.event_key;
end;
$$;

revoke all on function public.claim_cos_university_mass_distilled_evaluation_phase(text,text,text)
  from public, anon, authenticated;
grant execute on function public.claim_cos_university_mass_distilled_evaluation_phase(text,text,text)
  to service_role;

create or replace function public.complete_cos_university_mass_distilled_evaluation_phase(
  p_candidate_id text,
  p_artifact_hash text,
  p_phase text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_updated integer := 0;
  v_evidence jsonb;
  v_evidence_hash text;
  v_event_key text;
begin
  update public.cos_university_mass_distilled_evaluation_phase_claims
    set status = 'completed', completed_at = coalesce(completed_at, v_now)
  where candidate_id = p_candidate_id
    and artifact_hash = lower(p_artifact_hash)
    and phase = p_phase
    and status = 'claimed';
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return exists (
      select 1 from public.cos_university_mass_distilled_evaluation_phase_claims c
      where c.candidate_id = p_candidate_id
        and c.artifact_hash = lower(p_artifact_hash)
        and c.phase = p_phase
        and c.status = 'completed'
    );
  end if;

  v_evidence := jsonb_build_object(
    'profile','cos_mass_distilled_evaluation_phase_v1',
    'claim','mass_distilled_evaluation_phase_completed',
    'candidateId',p_candidate_id,
    'artifactHash',lower(p_artifact_hash),
    'phase',p_phase,
    'automaticRetryAuthorized',false,
    'productionTrafficAuthorized',false,
    'authorityExpanded',false
  );
  v_evidence_hash := encode(extensions.digest(convert_to(v_evidence::text,'UTF8'),'sha256'),'hex');
  v_event_key := encode(extensions.digest(convert_to(
    'cos_mass_distilled_evaluation_phase_v1:completed:' || p_candidate_id || ':' || lower(p_artifact_hash) || ':' || p_phase,
    'UTF8'
  ),'sha256'),'hex');
  insert into public.cos_university_learning_assurance_events (
    event_key,event_type,candidate_id,evidence_hash,evidence,verifier,observed_at
  ) values (
    v_event_key,'fine_tune',p_candidate_id,v_evidence_hash,v_evidence,'host_controller',v_now
  ) on conflict (event_key) do nothing;

  return true;
end;
$$;

revoke all on function public.complete_cos_university_mass_distilled_evaluation_phase(text,text,text)
  from public, anon, authenticated;
grant execute on function public.complete_cos_university_mass_distilled_evaluation_phase(text,text,text)
  to service_role;
