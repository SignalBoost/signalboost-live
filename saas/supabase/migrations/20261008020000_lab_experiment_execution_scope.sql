-- saas/supabase/migrations/20261008020000_lab_experiment_execution_scope.sql
-- One chosen Lab experiment runs through the University factory while the always-on line stays paused.
--
-- Owner 2026-10-07: the always-on line is paused; testing uses deliberate experiments run the way a user runs them.
-- The pause was all-or-nothing, so a deliberate experiment could not run. This migration adds:
--   1. lab.experiment_execution_grants: an expiring, run-scoped execution grant. It is written ONLY by
--      lab.start_experiment_university_run, which the authenticated Lab route calls inside a customer HarnessRun.
--   2. lab.start_experiment_university_run: atomically picks ONE prepared batch for the chosen subject under the SAME
--      admission rules as the rolling authorizer (64-128 items, >=50% independent sources, failure-derived limit),
--      authorizes a one-batch campaign through the existing authorize_cos_university_mass_distillation_campaign
--      (same $1.825 hard ceiling), binds the run to the experiment and writes the grant.
--   3. A transaction-local candidate scope honoured by the canary and exam claims, plus scoped_claim_* wrappers, so a
--      paused factory claims only the experiment's artifact. Unscoped (scheduled) calls behave exactly as before.
--   4. Read functions for the stations (active grants) and the University telemetry page (start options + status).
-- Unchanged: every evaluation threshold, the 38-call exam ceiling, <=$0.20 wake cost, one wake, canary and exam
-- concurrency limits, Builder Residency gating for Computer Science, Production-traffic prohibition. No billing.
-- Re-running is safe.

-- 1. Grants -----------------------------------------------------------------------------------------------------------
create table if not exists lab.experiment_execution_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  experiment_id uuid not null,
  university_run_id uuid not null unique references lab.university_run_bindings(run_id) on delete restrict,
  harness_run_id text not null check (harness_run_id ~ '^lab-customer-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  started_by uuid not null,
  subject_id text not null check (length(btrim(subject_id)) > 0),
  batch_key text not null,
  capability text not null default 'university.distillation.execute' check (capability = 'university.distillation.execute'),
  authority_expanded boolean not null default false check (authority_expanded = false),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at and expires_at <= created_at + interval '48 hours'),
  foreign key (experiment_id, organization_id) references lab.experiments(id, organization_id)
);
alter table lab.experiment_execution_grants enable row level security;
revoke all on lab.experiment_execution_grants from public, anon, authenticated, service_role;
create index if not exists experiment_execution_grants_expires_idx on lab.experiment_execution_grants(expires_at);
create index if not exists experiment_execution_grants_org_idx on lab.experiment_execution_grants(organization_id, created_at desc);

-- 2. Admission rule shared by the start function and the start options (same predicates as the rolling authorizer
--    20261006190000_mass_distillation_independent_source_admission.sql). Never weaker.
create or replace function lab.experiment_batch_eligible(p_batch_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.cos_university_distillation_curriculum_batches b
    where b.batch_key = p_batch_key
      and b.status = 'prepared'
      and b.dispatch_authorized = false
      and b.authority_expanded = false
      and b.student_model_id = 'Qwen/Qwen3-4B'
      and b.source_count between 64 and 128
      and (
        select count(*) from public.cos_continuous_learning cl
        where cl.content_hash = any(b.source_hashes::text[])
          and cl.source_kind not in ('teacher_synthetic_curriculum', 'teacher_hosted_curriculum', 'failure_derived_curriculum')
      ) >= ceil(b.source_count * 0.5)
      and not exists (select 1 from public.cos_university_mass_distillation_batch_runs r where r.batch_key = b.batch_key)
      and (
        (select count(*) from public.cos_continuous_learning cl
         where cl.content_hash = any(b.source_hashes::text[]) and cl.source_kind = 'failure_derived_curriculum') < 20
        or
        (select count(*) from public.cos_continuous_learning cl
         where cl.content_hash = any(b.source_hashes::text[]) and cl.source_kind <> 'failure_derived_curriculum') >= 5
      )
  )
$$;
revoke all on function lab.experiment_batch_eligible(text) from public, anon, authenticated;
grant execute on function lab.experiment_batch_eligible(text) to service_role;

create or replace function lab.start_experiment_university_run(
  p_organization_id uuid,
  p_experiment_id uuid,
  p_subject_id text,
  p_harness_run_id text,
  p_started_by uuid
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, lab as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  v_batch_key text;
  v_campaign_id uuid;
  v_run_id uuid;
  v_candidate_id text;
  v_grant_id uuid;
  v_expires_at timestamptz;
begin
  if session_user not in ('postgres', 'service_role') and jwt_role <> 'service_role' then
    raise exception 'lab_service_authority_denied';
  end if;
  if p_organization_id is null or p_experiment_id is null or p_started_by is null then
    raise exception 'lab_experiment_start_invalid';
  end if;
  if length(btrim(coalesce(p_subject_id, ''))) = 0 then raise exception 'lab_experiment_subject_invalid'; end if;
  if coalesce(p_harness_run_id, '') !~ '^lab-customer-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'lab_experiment_harness_run_invalid';
  end if;
  perform 1 from lab.experiments where id = p_experiment_id and organization_id = p_organization_id;
  if not found then raise exception 'lab_experiment_missing'; end if;

  select b.batch_key into v_batch_key
  from public.cos_university_distillation_curriculum_batches b
  where b.subject_id = p_subject_id
    and b.status = 'prepared'
    and b.dispatch_authorized = false
    and lab.experiment_batch_eligible(b.batch_key)
  order by b.prepared_at asc, b.batch_key asc
  for update skip locked
  limit 1;
  if v_batch_key is null then
    return jsonb_build_object('ok', false, 'reason', 'no_eligible_prepared_batch', 'subjectId', p_subject_id);
  end if;

  v_campaign_id := public.authorize_cos_university_mass_distillation_campaign(
    array[v_batch_key], 1.825000, 'itmounts-lab-experiment:' || p_experiment_id::text, interval '24 hours');

  select r.id, r.candidate_id into v_run_id, v_candidate_id
  from public.cos_university_mass_distillation_batch_runs r
  where r.campaign_id = v_campaign_id and r.batch_key = v_batch_key;
  if v_run_id is null then raise exception 'lab_experiment_run_missing_after_authorization'; end if;

  perform set_config('lab.trusted_organization_id', p_organization_id::text, true);
  perform lab.bind_university_run(v_run_id, p_organization_id, p_experiment_id);

  v_expires_at := now() + interval '48 hours';
  insert into lab.experiment_execution_grants (
    organization_id, experiment_id, university_run_id, harness_run_id, started_by, subject_id, batch_key, expires_at
  ) values (
    p_organization_id, p_experiment_id, v_run_id, p_harness_run_id, p_started_by, p_subject_id, v_batch_key, v_expires_at
  ) returning id into v_grant_id;

  return jsonb_build_object(
    'ok', true,
    'grantId', v_grant_id,
    'organizationId', p_organization_id,
    'experimentId', p_experiment_id,
    'universityRunId', v_run_id,
    'campaignId', v_campaign_id,
    'candidateId', v_candidate_id,
    'batchKey', v_batch_key,
    'subjectId', p_subject_id,
    'expiresAt', v_expires_at,
    'maxTrainingCostUsd', 1.825000,
    'authorityExpanded', false
  );
end $$;
revoke all on function lab.start_experiment_university_run(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function lab.start_experiment_university_run(uuid, uuid, text, text, uuid) to service_role;

create or replace function public.itmounts_lab_start_experiment_university_run(
  p_organization_id uuid, p_experiment_id uuid, p_subject_id text, p_harness_run_id text, p_started_by uuid
)
returns jsonb language sql security invoker set search_path = pg_catalog, lab as $$
  select lab.start_experiment_university_run(p_organization_id, p_experiment_id, p_subject_id, p_harness_run_id, p_started_by)
$$;
revoke all on function public.itmounts_lab_start_experiment_university_run(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.itmounts_lab_start_experiment_university_run(uuid, uuid, text, text, uuid) to service_role;

-- 3. Active grants for the factory stations ---------------------------------------------------------------------------
create or replace function lab.active_experiment_execution_grants()
returns table (
  grant_id uuid, organization_id uuid, experiment_id uuid, university_run_id uuid, harness_run_id text,
  expires_at timestamptz, candidate_id text, campaign_id uuid, capability text, authority_expanded boolean
)
language plpgsql stable security definer set search_path = pg_catalog, lab as $$
declare jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
begin
  if session_user not in ('postgres', 'service_role') and jwt_role <> 'service_role' then
    raise exception 'lab_service_authority_denied';
  end if;
  return query
  select g.id, g.organization_id, g.experiment_id, g.university_run_id, g.harness_run_id,
         g.expires_at, r.candidate_id, r.campaign_id, g.capability, g.authority_expanded
  from lab.experiment_execution_grants g
  join lab.university_run_bindings b
    on b.run_id = g.university_run_id and b.experiment_id = g.experiment_id and b.organization_id = g.organization_id
  join public.cos_university_mass_distillation_batch_runs r on r.id = g.university_run_id
  where g.expires_at > now()
  order by g.created_at asc
  limit 20;
end $$;
revoke all on function lab.active_experiment_execution_grants() from public, anon, authenticated;
grant execute on function lab.active_experiment_execution_grants() to service_role;

create or replace function public.itmounts_lab_active_experiment_execution_grants()
returns table (
  grant_id uuid, organization_id uuid, experiment_id uuid, university_run_id uuid, harness_run_id text,
  expires_at timestamptz, candidate_id text, campaign_id uuid, capability text, authority_expanded boolean
)
language sql stable security invoker set search_path = pg_catalog, lab as $$
  select * from lab.active_experiment_execution_grants()
$$;
revoke all on function public.itmounts_lab_active_experiment_execution_grants() from public, anon, authenticated;
grant execute on function public.itmounts_lab_active_experiment_execution_grants() to service_role;

-- 4. Start options and experiment status for the University telemetry page ------------------------------------------
create or replace function lab.experiment_start_options(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, lab as $$
declare jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
begin
  if session_user not in ('postgres', 'service_role') and jwt_role <> 'service_role' then
    raise exception 'lab_service_authority_denied';
  end if;
  if p_user_id is null then return null; end if;
  return jsonb_build_object(
    'experiments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'organizationId', e.organization_id,
        'organizationName', o.name,
        'experimentId', e.id,
        'projectName', p.name,
        'privacyTier', e.privacy_tier,
        'role', m.role
      ) order by o.name, p.name, e.id)
      from lab.organization_members m
      join lab.organizations o on o.id = m.organization_id
      join lab.experiments e on e.organization_id = m.organization_id
      join lab.projects p on p.id = e.project_id and p.organization_id = e.organization_id
      where m.user_id = p_user_id and m.status = 'active'
    ), '[]'::jsonb),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('subjectId', s.subject_id, 'eligibleBatches', s.n) order by s.subject_id)
      from (
        select b.subject_id, count(*)::integer as n
        from public.cos_university_distillation_curriculum_batches b
        where b.status = 'prepared' and b.dispatch_authorized = false and lab.experiment_batch_eligible(b.batch_key)
        group by b.subject_id
      ) s
    ), '[]'::jsonb),
    'runs', coalesce((
      select jsonb_agg(row_data order by (row_data->>'startedAt') desc)
      from (
        select jsonb_build_object(
          'grantId', g.id,
          'experimentId', g.experiment_id,
          'subjectId', g.subject_id,
          'candidateId', r.candidate_id,
          'startedAt', g.created_at,
          'expiresAt', g.expires_at,
          'active', g.expires_at > now(),
          'trainingStage', r.stage,
          'trainingFailure', left(coalesce(r.failure_reason, ''), 300),
          'artifactStatus', (select a.status from public.cos_local_distillation_artifacts a
                             where a.candidate_id = r.candidate_id order by a.created_at desc limit 1),
          'residencyStanding', (select e.standing from public.cos_university_residency_enrollments e
                                where e.candidate_id = r.candidate_id order by e.updated_at desc limit 1),
          'graduateStatus', (select gr.status from public.cos_university_graduate_model_registry gr
                             where gr.candidate_id = r.candidate_id order by gr.promoted_at desc nulls last limit 1)
        ) as row_data
        from lab.experiment_execution_grants g
        join lab.organization_members m
          on m.organization_id = g.organization_id and m.user_id = p_user_id and m.status = 'active'
        join public.cos_university_mass_distillation_batch_runs r on r.id = g.university_run_id
        order by g.created_at desc
        limit 20
      ) runs
    ), '[]'::jsonb)
  );
end $$;
revoke all on function lab.experiment_start_options(uuid) from public, anon, authenticated;
grant execute on function lab.experiment_start_options(uuid) to service_role;

create or replace function public.itmounts_lab_experiment_start_options(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = pg_catalog, lab as $$
  select lab.experiment_start_options(p_user_id)
$$;
revoke all on function public.itmounts_lab_experiment_start_options(uuid) from public, anon, authenticated;
grant execute on function public.itmounts_lab_experiment_start_options(uuid) to service_role;

-- 5. Candidate scope for the canary and exam claims -------------------------------------------------------------------
-- Empty/unset scope = every candidate (the scheduled line, unchanged). The scoped_claim_* wrappers set it for one transaction.
create or replace function public.university_claim_candidate_in_scope(p_candidate_id text)
returns boolean language sql stable set search_path = '' as $$
  select case
    when coalesce(pg_catalog.current_setting('itmounts.claim_candidate_scope', true), '') = '' then true
    else p_candidate_id = any(pg_catalog.string_to_array(pg_catalog.current_setting('itmounts.claim_candidate_scope', true), ','))
  end
$$;
revoke all on function public.university_claim_candidate_in_scope(text) from public, anon, authenticated;
grant execute on function public.university_claim_candidate_in_scope(text) to service_role;

do $migration$
declare
  v_definition text;
  v_anchor text;
  v_occurrences integer;
  v_name text;
begin
  foreach v_name in array array['claim_next_mass_distilled_runtime_canary', 'claim_next_mass_distilled_evaluation'] loop
    v_anchor := case v_name
      when 'claim_next_mass_distilled_runtime_canary' then 'where a.status in (''evaluation_ready'',''evaluation_pending'')'
      else 'where a.status=''evaluation_pending'''
    end;
    select pg_get_functiondef(p.oid) into v_definition
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name and p.pronargs = 0;
    if v_definition is null then raise exception '%() not found', v_name; end if;
    if position('university_claim_candidate_in_scope' in v_definition) > 0 then
      raise notice '% already honours the candidate scope', v_name;
      continue;
    end if;
    v_occurrences := (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor);
    if v_occurrences <> 1 then
      raise exception 'expected exactly one "%" in %(), found %', v_anchor, v_name, v_occurrences;
    end if;
    execute replace(v_definition, v_anchor,
      v_anchor || E'\n      and public.university_claim_candidate_in_scope(a.candidate_id)');
    select pg_get_functiondef(p.oid) into v_definition
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name and p.pronargs = 0;
    if position('university_claim_candidate_in_scope(a.candidate_id)' in v_definition) = 0 then
      raise exception '% does not honour the candidate scope after migration', v_name;
    end if;
  end loop;
  -- The exam ceilings must be exactly what the previous migrations left.
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'claim_next_mass_distilled_evaluation' and p.pronargs = 0;
  if position('v_max_judge<>4' in v_definition) = 0 or position('v_max_cost>0.200000' in v_definition) = 0 then
    raise exception 'exam judge or wake-cost ceiling altered; refusing';
  end if;
end
$migration$;

create or replace function public.scoped_claim_next_mass_distilled_runtime_canary(p_candidate_ids text[])
returns table (
  candidate_id text, subject_id text, artifact_id text, artifact_hash text, revision_key text, evidence_ref text,
  approval_observed_at timestamptz, max_canary_invocations integer, max_estimated_canary_cost_usd numeric,
  reservation_event_key text
)
language plpgsql security definer set search_path = '' as $$
begin
  if p_candidate_ids is null or cardinality(p_candidate_ids) < 1 or cardinality(p_candidate_ids) > 100
     or exists (select 1 from unnest(p_candidate_ids) x where x is null or x !~ '^mass:[^,]+$') then
    raise exception 'claim_candidate_scope_invalid';
  end if;
  perform pg_catalog.set_config('itmounts.claim_candidate_scope', pg_catalog.array_to_string(p_candidate_ids, ','), true);
  return query select * from public.claim_next_mass_distilled_runtime_canary();
  perform pg_catalog.set_config('itmounts.claim_candidate_scope', '', true);
end $$;
revoke all on function public.scoped_claim_next_mass_distilled_runtime_canary(text[]) from public, anon, authenticated;
grant execute on function public.scoped_claim_next_mass_distilled_runtime_canary(text[]) to service_role;

create or replace function public.scoped_claim_next_mass_distilled_evaluation(p_candidate_ids text[])
returns table (
  candidate_id text, subject_id text, artifact_id text, artifact_hash text, revision_key text, dataset_hash text,
  endpoint_id text, approval_observed_at timestamptz, max_endpoint_calls integer, max_judge_calls integer,
  max_runtime_wake_attempts integer, max_estimated_runtime_wake_cost_usd numeric, reservation_event_key text
)
language plpgsql security definer set search_path = '' as $$
begin
  if p_candidate_ids is null or cardinality(p_candidate_ids) < 1 or cardinality(p_candidate_ids) > 100
     or exists (select 1 from unnest(p_candidate_ids) x where x is null or x !~ '^mass:[^,]+$') then
    raise exception 'claim_candidate_scope_invalid';
  end if;
  perform pg_catalog.set_config('itmounts.claim_candidate_scope', pg_catalog.array_to_string(p_candidate_ids, ','), true);
  return query select * from public.claim_next_mass_distilled_evaluation();
  perform pg_catalog.set_config('itmounts.claim_candidate_scope', '', true);
end $$;
revoke all on function public.scoped_claim_next_mass_distilled_evaluation(text[]) from public, anon, authenticated;
grant execute on function public.scoped_claim_next_mass_distilled_evaluation(text[]) to service_role;

notify pgrst, 'reload schema';

-- Verify (expect canary_scoped = true, exam_scoped = true, grants_table = true):
--   select
--     (select position('university_claim_candidate_in_scope' in pg_get_functiondef(p.oid)) > 0 from pg_proc p
--      join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public' and p.proname = 'claim_next_mass_distilled_runtime_canary' and p.pronargs = 0) as canary_scoped,
--     (select position('university_claim_candidate_in_scope' in pg_get_functiondef(p.oid)) > 0 from pg_proc p
--      join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public' and p.proname = 'claim_next_mass_distilled_evaluation' and p.pronargs = 0) as exam_scoped,
--     to_regclass('lab.experiment_execution_grants') is not null as grants_table;
