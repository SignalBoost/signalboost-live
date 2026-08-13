-- COS retention/consolidation: learned capability must survive time and later reality.
--
-- Retention checks are deliberately separate from held-out promotion evidence. Replaying a prior
-- independent holdout after a delay can test retention, but it must never increase holdout breadth.
-- Production contradictions are stronger evidence: an explicitly verified contradiction quarantines
-- a skill rather than allowing old historical counters to keep it active.

alter table public.cos_cognitive_skills
  add column if not exists retention_attempts integer not null default 0 check (retention_attempts >= 0),
  add column if not exists retention_successes integer not null default 0 check (retention_successes >= 0 and retention_successes <= retention_attempts),
  add column if not exists retention_consecutive_failures integer not null default 0 check (retention_consecutive_failures >= 0),
  add column if not exists last_retention_checked_at timestamptz,
  add column if not exists next_retention_due_at timestamptz,
  add column if not exists last_production_outcome_at timestamptz,
  add column if not exists production_consecutive_failures integer not null default 0 check (production_consecutive_failures >= 0);

create index if not exists cos_cognitive_skills_retention_due_idx
  on public.cos_cognitive_skills(status, next_retention_due_at)
  where status in ('validated','learned','mastered','weakened');

update public.cos_cognitive_skills
set next_retention_due_at = coalesce(last_validated_at, now()) +
  case status
    when 'mastered' then interval '30 days'
    when 'learned' then interval '21 days'
    else interval '14 days'
  end
where status in ('validated','learned','mastered')
  and next_retention_due_at is null;

alter table public.cos_cognitive_experiences
  drop constraint if exists cos_cognitive_experiences_experience_kind_check;

alter table public.cos_cognitive_experiences
  add constraint cos_cognitive_experiences_experience_kind_check check (experience_kind in (
    'encounter',
    'teacher',
    'feedback',
    'reflection',
    'practice',
    'holdout',
    'retention',
    'production_use'
  ));

create table if not exists public.cos_retention_checks (
  id uuid primary key default gen_random_uuid(),
  skill_key text not null references public.cos_cognitive_skills(skill_key) on delete cascade,
  source_queue_id uuid references public.cos_active_practice_queue(id) on delete set null,
  prompt text not null,
  rubric jsonb not null default '{}'::jsonb,
  retention_source text not null check (retention_source in (
    'delayed_independent_replay',
    'frontier_teacher',
    'curated',
    'production_replay'
  )),
  scheduled_from_status text not null check (scheduled_from_status in (
    'validated','learned','mastered','weakened'
  )),
  status text not null default 'queued' check (status in (
    'queued','running','passed','failed','blocked','discarded'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 1 check (max_attempts between 1 and 2),
  last_score double precision check (last_score is null or (last_score >= 0 and last_score <= 1)),
  last_error text,
  due_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cos_retention_checks_due_idx
  on public.cos_retention_checks(status, due_at, created_at);
create index if not exists cos_retention_checks_skill_idx
  on public.cos_retention_checks(skill_key, created_at desc);

alter table public.cos_retention_checks enable row level security;

comment on table public.cos_retention_checks is
  'Delayed cognitive retention checks. Replays do not increment held-out breadth or promotion counters; they only measure whether previously validated capability persists.';

create or replace function public.cos_record_cognitive_retention_result(
  p_check_id uuid,
  p_success boolean,
  p_score double precision,
  p_answer text,
  p_evidence jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.cos_retention_checks%rowtype;
  s public.cos_cognitive_skills%rowtype;
  now_at timestamptz := now();
  next_streak integer;
  weaken_now boolean;
  next_due timestamptz;
  next_status text;
begin
  if p_score < 0 or p_score > 1 then
    raise exception 'score_out_of_range';
  end if;

  select * into q
  from public.cos_retention_checks
  where id = p_check_id
  for update;

  if q.id is null then raise exception 'retention_check_not_found'; end if;
  if q.status <> 'running' then raise exception 'retention_check_not_running'; end if;

  select * into s
  from public.cos_cognitive_skills
  where skill_key = q.skill_key
  for update;

  if s.id is null then raise exception 'retention_skill_not_found'; end if;

  next_streak := case when p_success then 0 else s.retention_consecutive_failures + 1 end;
  weaken_now := (not p_success)
    and next_streak >= 2
    and s.status in ('validated','learned','mastered');

  next_due := case
    when not p_success then now_at + interval '1 day'
    when s.status = 'mastered' then now_at + interval '30 days'
    when s.status = 'learned' then now_at + interval '21 days'
    else now_at + interval '14 days'
  end;

  next_status := case
    when s.quarantined_at is not null then 'quarantined'
    when weaken_now then 'weakened'
    else s.status
  end;

  update public.cos_retention_checks
  set status = case when p_success then 'passed' else 'failed' end,
      attempt_count = attempt_count + 1,
      last_score = p_score,
      last_error = case when p_success then null else coalesce(p_evidence->>'reason','retention_failed') end,
      completed_at = now_at,
      updated_at = now_at
  where id = q.id;

  update public.cos_cognitive_skills
  set retention_attempts = retention_attempts + 1,
      retention_successes = retention_successes + case when p_success then 1 else 0 end,
      retention_consecutive_failures = next_streak,
      failure_count = failure_count + case when p_success then 0 else 1 end,
      last_retention_checked_at = now_at,
      last_validated_at = case when p_success then now_at else last_validated_at end,
      next_retention_due_at = next_due,
      weakened_at = case
        when p_success then null
        when weaken_now then now_at
        else weakened_at
      end,
      status = next_status,
      updated_at = now_at
  where id = s.id;

  insert into public.cos_cognitive_experiences(
    experience_hash, subject, experience_kind, skill_key, variant_key,
    source_kind, source_ref, success, score, evidence,
    first_observed_at, last_observed_at, updated_at
  ) values (
    'retention_check:' || q.id::text || ':' || (q.attempt_count + 1)::text,
    s.subject,
    'retention',
    s.skill_key,
    'retention:' || q.id::text,
    q.retention_source,
    'cos_retention_checks:' || q.id::text,
    p_success,
    p_score,
    jsonb_build_object(
      'answer', left(coalesce(p_answer,''), 12000),
      'rubric', q.rubric,
      'evaluation', coalesce(p_evidence,'{}'::jsonb),
      'sourceQueueId', q.source_queue_id,
      'scheduledFromStatus', q.scheduled_from_status,
      'doesNotIncreaseHoldoutBreadth', true
    ),
    now_at, now_at, now_at
  ) on conflict (experience_hash) do nothing;

  return jsonb_build_object(
    'checkId', q.id,
    'skillKey', s.skill_key,
    'passed', p_success,
    'retentionFailureStreak', next_streak,
    'status', next_status,
    'nextRetentionDueAt', next_due
  );
end;
$$;

revoke all on function public.cos_record_cognitive_retention_result(uuid,boolean,double precision,text,jsonb) from public;
grant execute on function public.cos_record_cognitive_retention_result(uuid,boolean,double precision,text,jsonb) to service_role;

create or replace function public.cos_record_cognitive_production_outcome(
  p_skill_key text,
  p_success boolean,
  p_score double precision default 1.0,
  p_contradiction boolean default false,
  p_contradiction_reason text default null,
  p_evidence jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.cos_cognitive_skills%rowtype;
  now_at timestamptz := now();
  next_streak integer;
  weaken_now boolean;
  quarantine_now boolean;
  next_status text;
  experience_id uuid := gen_random_uuid();
begin
  if p_score < 0 or p_score > 1 then
    raise exception 'score_out_of_range';
  end if;

  select * into s
  from public.cos_cognitive_skills
  where skill_key = p_skill_key
  for update;

  if s.id is null then raise exception 'production_skill_not_found'; end if;

  next_streak := case when p_success then 0 else s.production_consecutive_failures + 1 end;
  quarantine_now := p_contradiction;
  weaken_now := (not quarantine_now)
    and (not p_success)
    and next_streak >= 2
    and s.status in ('validated','learned','mastered');

  next_status := case
    when quarantine_now then 'quarantined'
    when s.quarantined_at is not null then 'quarantined'
    when weaken_now then 'weakened'
    else s.status
  end;

  update public.cos_cognitive_skills
  set production_attempts = production_attempts + 1,
      production_successes = production_successes + case when p_success then 1 else 0 end,
      production_consecutive_failures = next_streak,
      failure_count = failure_count + case when p_success then 0 else 1 end,
      last_production_outcome_at = now_at,
      last_used_at = now_at,
      weakened_at = case when weaken_now then now_at else weakened_at end,
      next_retention_due_at = case when weaken_now then now_at + interval '1 day' else next_retention_due_at end,
      quarantined_at = case when quarantine_now then now_at else quarantined_at end,
      quarantine_reason = case
        when quarantine_now then left(coalesce(nullif(trim(p_contradiction_reason),''),'verified production contradiction'), 2000)
        else quarantine_reason
      end,
      status = next_status,
      updated_at = now_at
  where id = s.id;

  insert into public.cos_cognitive_experiences(
    id, experience_hash, subject, experience_kind, skill_key,
    source_kind, source_ref, success, score, evidence,
    first_observed_at, last_observed_at, updated_at
  ) values (
    experience_id,
    'production_outcome:' || experience_id::text,
    s.subject,
    'production_use',
    s.skill_key,
    'verified_production_outcome',
    'cos_record_cognitive_production_outcome',
    p_success,
    p_score,
    jsonb_build_object(
      'contradiction', p_contradiction,
      'contradictionReason', p_contradiction_reason,
      'evidence', coalesce(p_evidence,'{}'::jsonb)
    ),
    now_at, now_at, now_at
  );

  return jsonb_build_object(
    'skillKey', s.skill_key,
    'success', p_success,
    'productionFailureStreak', next_streak,
    'weakened', weaken_now,
    'quarantined', quarantine_now,
    'status', next_status
  );
end;
$$;

revoke all on function public.cos_record_cognitive_production_outcome(text,boolean,double precision,boolean,text,jsonb) from public;
grant execute on function public.cos_record_cognitive_production_outcome(text,boolean,double precision,boolean,text,jsonb) to service_role;
