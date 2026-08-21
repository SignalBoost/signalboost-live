-- General COS failure autopsy: poor outcome -> explicit causal-stage candidates -> shadow correction -> separate retest.
--
-- This layer stores only explicit execution/outcome artifacts. It never stores hidden chain-of-thought.
-- Autopsy rows are keyed by the exact reasoner turn_id and refresh when outcome, execution, or
-- evidence-use telemetry arrives, so post-response writes cannot race diagnosis permanently.

alter table public.cos_turn_experience
  add column if not exists problem_class text,
  add column if not exists predicted_confidence double precision,
  add column if not exists route_class text,
  add column if not exists response_source text,
  add column if not exists evidence_summary jsonb,
  add column if not exists failure_reason text;

create index if not exists cos_turn_experience_problem_class_idx
  on public.cos_turn_experience(problem_class, created_at desc)
  where problem_class is not null;

create table if not exists public.cos_turn_failure_autopsies (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid not null unique,
  problem_class text not null default 'general reasoning',
  primary_stage text,
  stage_candidates jsonb not null default '[]'::jsonb,
  observed_evidence jsonb not null default '{}'::jsonb,
  falsifier text,
  corrective_guidance text,
  outcome_source text,
  outcome_at timestamptz,
  source_case_id text,
  status text not null default 'awaiting_evidence'
    check (status in ('awaiting_evidence','retest_pending','retest_running','retest_passed','retest_failed','insufficient_evidence')),
  retest_case_id text,
  retest_turn_id uuid,
  retest_passed boolean,
  retest_at timestamptz,
  lesson_retained boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (primary_stage is null or primary_stage in (
    'retrieval','evidence_selection','reasoning','grounding','calibration','tool_execution','stale_or_missing_knowledge'
  ))
);

create index if not exists cos_turn_failure_autopsies_status_idx
  on public.cos_turn_failure_autopsies(status, updated_at desc);
create index if not exists cos_turn_failure_autopsies_problem_idx
  on public.cos_turn_failure_autopsies(problem_class, status, updated_at desc);

create table if not exists public.cos_turn_failure_autopsy_retests (
  id uuid primary key default gen_random_uuid(),
  autopsy_id uuid not null references public.cos_turn_failure_autopsies(id) on delete cascade,
  case_id text not null,
  case_domain text,
  mode text not null default 'guided_shadow' check (mode in ('guided_shadow')),
  turn_id uuid,
  passed boolean not null,
  reasons text[] not null default '{}'::text[],
  latency_ms integer not null default 0 check (latency_ms >= 0),
  created_at timestamptz not null default now(),
  unique(autopsy_id, case_id)
);

create index if not exists cos_turn_failure_autopsy_retests_autopsy_idx
  on public.cos_turn_failure_autopsy_retests(autopsy_id, created_at desc);

alter table public.cos_turn_failure_autopsies enable row level security;
alter table public.cos_turn_failure_autopsy_retests enable row level security;
revoke all on public.cos_turn_failure_autopsies from anon, authenticated;
revoke all on public.cos_turn_failure_autopsy_retests from anon, authenticated;

comment on table public.cos_turn_failure_autopsies is
  'Exact-turn bounded failure autopsy from explicit execution/evidence/outcome telemetry. Corrective guidance remains shadow-only until a separate guided retest passes.';
comment on column public.cos_turn_failure_autopsies.primary_stage is
  'Primary explicit causal-stage candidate: retrieval, evidence_selection, reasoning, grounding, calibration, tool_execution, or stale_or_missing_knowledge. This is not hidden chain-of-thought.';
comment on column public.cos_turn_failure_autopsies.corrective_guidance is
  'Bounded guidance used only by a shadow retest. Passing retains the lesson as validated evidence; it does not automatically change live routing, thresholds, tools, or authorization.';

create or replace function public.cos_refresh_turn_failure_autopsy(p_turn_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.cos_turn_outcomes%rowtype;
  e public.cos_turn_experience%rowtype;
  eu record;
  poor boolean := false;
  total_injected integer := 0;
  total_cited integer := 0;
  phase_failures integer := 0;
  primary_stage text := null;
  candidates jsonb := '[]'::jsonb;
  evidence jsonb := '{}'::jsonb;
  falsifier_text text := null;
  guidance_text text := null;
  source_case text := null;
  failure_text text := '';
  tool_signal boolean := false;
  grounding_signal boolean := false;
  missing_signal boolean := false;
  high_confidence_failure boolean := false;
begin
  select * into o from public.cos_turn_outcomes where turn_id = p_turn_id;
  if not found then return; end if;

  -- A guided retest failure belongs to its original autopsy; do not recursively autopsy the retest.
  if coalesce(o.outcome_source, '') like 'failure_autopsy_retest:%' then return; end if;

  poor := o.verified_success is false
    or o.user_feedback in ('negative','correction')
    or o.repair_needed is true;
  if not poor then return; end if;

  if coalesce(o.outcome_source, '') like 'evidence_utilization_benchmark:%' then
    source_case := split_part(o.outcome_source, ':', 2);
  end if;

  select * into e from public.cos_turn_experience where turn_id = p_turn_id;
  if not found then
    insert into public.cos_turn_failure_autopsies (
      turn_id, problem_class, outcome_source, outcome_at, source_case_id, status, updated_at
    ) values (
      p_turn_id, 'general reasoning', o.outcome_source, o.outcome_at, source_case, 'awaiting_evidence', now()
    )
    on conflict (turn_id) do update set
      outcome_source = excluded.outcome_source,
      outcome_at = excluded.outcome_at,
      source_case_id = coalesce(excluded.source_case_id, cos_turn_failure_autopsies.source_case_id),
      updated_at = now();
    return;
  end if;

  total_injected :=
      coalesce(nullif(e.evidence_summary #>> '{knowledgeGraph,injected}', '')::integer, 0)
    + coalesce(nullif(e.evidence_summary #>> '{learnedCorpus,injected}', '')::integer, 0)
    + coalesce(nullif(e.evidence_summary #>> '{enterpriseMemory,injected}', '')::integer, 0)
    + coalesce(nullif(e.evidence_summary #>> '{userMemory,injected}', '')::integer, 0)
    + coalesce(nullif(e.evidence_summary #>> '{cognitiveSkills,injected}', '')::integer, 0);
  total_cited :=
      coalesce(nullif(e.evidence_summary #>> '{knowledgeGraph,cited}', '')::integer, 0)
    + coalesce(nullif(e.evidence_summary #>> '{learnedCorpus,cited}', '')::integer, 0)
    + coalesce(nullif(e.evidence_summary #>> '{enterpriseMemory,cited}', '')::integer, 0)
    + coalesce(nullif(e.evidence_summary #>> '{userMemory,cited}', '')::integer, 0)
    + coalesce(nullif(e.evidence_summary #>> '{cognitiveSkills,cited}', '')::integer, 0);

  select injected, cited into eu
    from public.cos_evidence_source_use
    where turn_id = p_turn_id and evidence_system = 'learned_corpus';
  if found then
    -- evidence_summary already includes learned corpus when ordinary-turn enrichment arrived.
    -- MAX rather than addition avoids double-counting that same evidence while still covering
    -- benchmark turns whose full summary has not been enriched yet.
    total_injected := greatest(total_injected, coalesce(eu.injected, 0));
    total_cited := greatest(total_cited, coalesce(eu.cited, 0));
  end if;

  select count(*) into phase_failures
  from jsonb_array_elements(coalesce(e.phases, '[]'::jsonb)) as phase
  where phase->>'ok' = 'false';

  failure_text := lower(concat_ws(' ', e.failure_reason, e.response_source, e.route_class, o.outcome_source));
  tool_signal := failure_text ~ '(tool[_ ]|tool error|permission denied|authorization failed|executor failed|action failed)';
  grounding_signal := failure_text ~ '(citation|grounding|unsupported claim|uncited|source conflict)';
  missing_signal := failure_text ~ '(insufficient.*evidence|no relevant|no matching durable|could not verify|missing.*knowledge|no source|live verification refusal)';
  high_confidence_failure := coalesce(e.predicted_confidence, 0) >= 0.72 and o.verified_success is false;

  if tool_signal then
    primary_stage := 'tool_execution';
  elsif missing_signal and total_injected = 0 then
    primary_stage := 'stale_or_missing_knowledge';
  elsif total_injected = 0 then
    primary_stage := 'retrieval';
  elsif total_injected > 0 and total_cited = 0 then
    primary_stage := 'evidence_selection';
  elsif grounding_signal then
    primary_stage := 'grounding';
  elsif high_confidence_failure then
    primary_stage := 'calibration';
  else
    primary_stage := 'reasoning';
  end if;

  candidates := jsonb_build_array(jsonb_build_object(
    'stage', primary_stage,
    'rank', 1,
    'basis', case primary_stage
      when 'tool_execution' then 'Explicit tool/executor/permission failure signal is present.'
      when 'stale_or_missing_knowledge' then 'Poor outcome coincided with explicit missing/insufficient evidence and no injected evidence.'
      when 'retrieval' then 'Poor outcome had no injected evidence available to the reasoner.'
      when 'evidence_selection' then 'Evidence was injected but none was cited as materially used.'
      when 'grounding' then 'Explicit citation/grounding failure signal is present.'
      when 'calibration' then 'Verified failure followed confidence at or above the live threshold.'
      else 'The reasoner answered, but stronger retrieval/grounding/calibration evidence does not explain the poor outcome.'
    end
  ));

  if high_confidence_failure and primary_stage <> 'calibration' then
    candidates := candidates || jsonb_build_array(jsonb_build_object(
      'stage','calibration','rank',2,'basis','The failed turn was reported at confidence >= 0.72.'
    ));
  end if;
  if total_injected > 0 and total_cited = 0 and primary_stage <> 'evidence_selection' then
    candidates := candidates || jsonb_build_array(jsonb_build_object(
      'stage','evidence_selection','rank',2,'basis','Injected evidence was unused according to citation telemetry.'
    ));
  end if;
  if phase_failures > 0 and primary_stage <> 'reasoning' then
    candidates := candidates || jsonb_build_array(jsonb_build_object(
      'stage','reasoning','rank',3,'basis','At least one explicit reasoning phase recorded ok=false.'
    ));
  end if;

  evidence := jsonb_build_object(
    'schemaVersion', 1,
    'semantics', 'explicit_failure_artifacts_not_hidden_chain_of_thought',
    'answered', e.answered,
    'problemClass', coalesce(e.problem_class, 'general reasoning'),
    'predictedConfidence', e.predicted_confidence,
    'routeClass', e.route_class,
    'responseSource', e.response_source,
    'totalInjected', total_injected,
    'totalCited', total_cited,
    'phaseFailures', phase_failures,
    'phases', coalesce(e.phases, '[]'::jsonb),
    'skipped', coalesce(e.skipped, '[]'::jsonb),
    'evidenceSummary', coalesce(e.evidence_summary, '{}'::jsonb),
    'outcome', jsonb_build_object(
      'verifiedSuccess', o.verified_success,
      'repairNeeded', o.repair_needed,
      'escalated', o.escalated,
      'userFeedback', o.user_feedback,
      'source', o.outcome_source,
      'at', o.outcome_at
    )
  );

  case primary_stage
    when 'retrieval' then
      falsifier_text := 'A separate retest retrieves relevant authorized evidence but still fails without an evidence-selection or grounding defect.';
      guidance_text := 'For this shadow retest, retrieve enough relevant authorized evidence before synthesis. Do not lower source-trust, tenant-scope, or authorization gates. If no relevant evidence exists, say so rather than filling the gap from unsupported certainty.';
    when 'evidence_selection' then
      falsifier_text := 'A separate retest materially uses relevant injected evidence and still fails for a reason unrelated to evidence choice.';
      guidance_text := 'For this shadow retest, use only injected evidence that materially supports the answer. Cite supplied evidence labels when they actually inform a claim, ignore irrelevant context, and do not restate evidence that does not change the answer.';
    when 'grounding' then
      falsifier_text := 'A separate retest satisfies the explicit grounding/citation contract and still fails on the substantive reasoning.';
      guidance_text := 'For this shadow retest, ground every evidence-dependent factual claim in supplied evidence and cite only labels that truly support it. If the evidence is insufficient or conflicting, state uncertainty instead of inventing certainty.';
    when 'calibration' then
      falsifier_text := 'A separate comparable retest is correct at the same confidence band, showing the prior failure was not systematic overconfidence.';
      guidance_text := 'For this shadow retest, treat confidence as a prediction to be earned. Lower it when required parts, evidence, observables, or falsifiers are missing; do not claim threshold-level confidence merely because a fluent answer was produced.';
    when 'tool_execution' then
      falsifier_text := 'A separate retest uses the same governed tool boundary successfully with valid inputs and permissions.';
      guidance_text := 'For this shadow retest, verify tool inputs, permission state, timeout/error class, and deterministic outputs before relying on the tool. Never widen authorization or bypass approval to make the retest pass.';
    when 'stale_or_missing_knowledge' then
      falsifier_text := 'A separate retest has fresh authoritative evidence available and still fails for a reasoning or grounding reason.';
      guidance_text := 'For this shadow retest, require current or authoritative evidence for claims that cannot safely come from durable/model memory. Do not substitute pretrained memory for missing fresh evidence.';
    else
      falsifier_text := 'A separate retest follows the requested structure and still fails despite adequate evidence and calibration.';
      guidance_text := 'For this shadow retest, explicitly cover every requested output requirement, compare candidate explanations against the facts given, and include concrete observables/falsifiers where the question is diagnostic. Use repair only when the first draft misses those requirements.';
  end case;

  insert into public.cos_turn_failure_autopsies (
    turn_id, problem_class, primary_stage, stage_candidates, observed_evidence,
    falsifier, corrective_guidance, outcome_source, outcome_at, source_case_id,
    status, lesson_retained, updated_at
  ) values (
    p_turn_id, coalesce(nullif(e.problem_class,''), 'general reasoning'), primary_stage, candidates, evidence,
    falsifier_text, guidance_text, o.outcome_source, o.outcome_at, source_case,
    'retest_pending', false, now()
  )
  on conflict (turn_id) do update set
    problem_class = excluded.problem_class,
    primary_stage = excluded.primary_stage,
    stage_candidates = excluded.stage_candidates,
    observed_evidence = excluded.observed_evidence,
    falsifier = excluded.falsifier,
    corrective_guidance = excluded.corrective_guidance,
    outcome_source = excluded.outcome_source,
    outcome_at = excluded.outcome_at,
    source_case_id = coalesce(excluded.source_case_id, cos_turn_failure_autopsies.source_case_id),
    status = case
      when cos_turn_failure_autopsies.status in ('retest_running','retest_passed','retest_failed')
        then cos_turn_failure_autopsies.status
      else excluded.status
    end,
    lesson_retained = cos_turn_failure_autopsies.lesson_retained,
    updated_at = now();
end;
$$;

revoke all on function public.cos_refresh_turn_failure_autopsy(uuid) from public;
grant execute on function public.cos_refresh_turn_failure_autopsy(uuid) to service_role;

create or replace function public.cos_failure_autopsy_outcome_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cos_refresh_turn_failure_autopsy(new.turn_id);
  return new;
end;
$$;

create or replace function public.cos_failure_autopsy_experience_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.cos_turn_outcomes where turn_id = new.turn_id) then
    perform public.cos_refresh_turn_failure_autopsy(new.turn_id);
  end if;
  return new;
end;
$$;

create or replace function public.cos_failure_autopsy_evidence_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.cos_turn_outcomes where turn_id = new.turn_id) then
    perform public.cos_refresh_turn_failure_autopsy(new.turn_id);
  end if;
  return new;
end;
$$;

drop trigger if exists cos_failure_autopsy_on_outcome on public.cos_turn_outcomes;
create trigger cos_failure_autopsy_on_outcome
after insert or update on public.cos_turn_outcomes
for each row execute function public.cos_failure_autopsy_outcome_trigger();

drop trigger if exists cos_failure_autopsy_on_experience on public.cos_turn_experience;
create trigger cos_failure_autopsy_on_experience
after insert or update of problem_class, predicted_confidence, route_class, response_source, evidence_summary, failure_reason, phases, skipped, answered
on public.cos_turn_experience
for each row execute function public.cos_failure_autopsy_experience_trigger();

drop trigger if exists cos_failure_autopsy_on_evidence on public.cos_evidence_source_use;
create trigger cos_failure_autopsy_on_evidence
after insert or update of injected, cited, by_source_kind on public.cos_evidence_source_use
for each row execute function public.cos_failure_autopsy_evidence_trigger();

-- Backfill existing poor outcomes. Rows without execution telemetry remain awaiting_evidence and
-- will refresh automatically if the missing post-response row arrives later.
do $$
declare
  row record;
begin
  for row in
    select turn_id from public.cos_turn_outcomes
    where verified_success is false
       or user_feedback in ('negative','correction')
       or repair_needed is true
  loop
    perform public.cos_refresh_turn_failure_autopsy(row.turn_id);
  end loop;
end;
$$;
