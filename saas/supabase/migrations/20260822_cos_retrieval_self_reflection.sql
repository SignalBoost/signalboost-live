-- COS retrieval self-reflection v1.
-- Stores only bounded retrieval artifacts and later verified outcome correlation.
-- No raw prompt, answer, source content, or hidden reasoning is persisted here.

create table if not exists public.cos_retrieval_reflections (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid not null,
  evidence_system text not null default 'learned_corpus',
  reflection_version text not null,
  injected integer not null check (injected > 0),
  cited integer not null check (cited >= 0 and cited <= injected),
  unused_rate double precision not null check (unused_rate >= 0 and unused_rate <= 1),
  distinct_source_kinds integer not null default 0 check (distinct_source_kinds >= 0),
  avg_similarity double precision null check (avg_similarity is null or (avg_similarity >= 0 and avg_similarity <= 1)),
  cited_avg_similarity double precision null check (cited_avg_similarity is null or (cited_avg_similarity >= 0 and cited_avg_similarity <= 1)),
  unused_avg_similarity double precision null check (unused_avg_similarity is null or (unused_avg_similarity >= 0 and unused_avg_similarity <= 1)),
  sufficiency text not null check (sufficiency in ('weak','mixed','adequate','over_supplied')),
  missing_evidence_class text not null check (missing_evidence_class in ('none','retrieval_quality','source_diversity','grounding_use','unknown')),
  recommendation text not null check (recommendation in ('no_change','reduce_context','raise_similarity_floor','diversify_sources','inspect_grounding')),
  predicted_failure_risk double precision not null check (predicted_failure_risk >= 0 and predicted_failure_risk <= 1),
  signals jsonb not null default '{}'::jsonb,
  observed_verified_success boolean null,
  observed_repair_needed boolean null,
  outcome_source text null,
  prediction_correct boolean null,
  brier_score double precision null check (brier_score is null or (brier_score >= 0 and brier_score <= 1)),
  outcome_correlated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (turn_id, evidence_system, reflection_version)
);

create index if not exists cos_retrieval_reflections_created_idx
  on public.cos_retrieval_reflections (created_at desc);
create index if not exists cos_retrieval_reflections_outcome_idx
  on public.cos_retrieval_reflections (observed_verified_success, recommendation, created_at desc);

alter table public.cos_retrieval_reflections enable row level security;

-- Service-role only. Intentionally no user-facing RLS policy.
revoke all on table public.cos_retrieval_reflections from anon, authenticated;

create or replace function public.cos_fill_retrieval_reflection_existing_outcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  outcome record;
  observed_failure double precision;
begin
  select verified_success, repair_needed, outcome_source, outcome_at
    into outcome
    from public.cos_turn_outcomes
   where turn_id = new.turn_id;

  if found then
    new.observed_repair_needed := outcome.repair_needed;
    new.outcome_source := outcome.outcome_source;
    if outcome.verified_success is not null then
      observed_failure := case when outcome.verified_success then 0.0 else 1.0 end;
      new.observed_verified_success := outcome.verified_success;
      new.prediction_correct := ((new.predicted_failure_risk >= 0.5) = (not outcome.verified_success));
      new.brier_score := power(new.predicted_failure_risk - observed_failure, 2);
      new.outcome_correlated_at := coalesce(outcome.outcome_at, now());
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.cos_correlate_retrieval_reflection_outcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  observed_failure double precision;
begin
  if new.verified_success is null then
    update public.cos_retrieval_reflections
       set observed_repair_needed = new.repair_needed,
           outcome_source = new.outcome_source,
           updated_at = now()
     where turn_id = new.turn_id;
    return new;
  end if;

  observed_failure := case when new.verified_success then 0.0 else 1.0 end;
  update public.cos_retrieval_reflections
     set observed_verified_success = new.verified_success,
         observed_repair_needed = new.repair_needed,
         outcome_source = new.outcome_source,
         prediction_correct = ((predicted_failure_risk >= 0.5) = (not new.verified_success)),
         brier_score = power(predicted_failure_risk - observed_failure, 2),
         outcome_correlated_at = coalesce(new.outcome_at, now()),
         updated_at = now()
   where turn_id = new.turn_id;
  return new;
end;
$$;

drop trigger if exists cos_retrieval_reflection_existing_outcome on public.cos_retrieval_reflections;
create trigger cos_retrieval_reflection_existing_outcome
before insert or update of predicted_failure_risk on public.cos_retrieval_reflections
for each row execute function public.cos_fill_retrieval_reflection_existing_outcome();

drop trigger if exists cos_retrieval_reflection_outcome_correlation on public.cos_turn_outcomes;
create trigger cos_retrieval_reflection_outcome_correlation
after insert or update of verified_success, repair_needed, outcome_source, outcome_at on public.cos_turn_outcomes
for each row execute function public.cos_correlate_retrieval_reflection_outcome();

comment on table public.cos_retrieval_reflections is
  'Prompt-free COS retrieval self-reflections correlated to later verified outcomes; recommendations are hypotheses only and never directly change live retrieval.';
