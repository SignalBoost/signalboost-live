-- COS adaptive learning memory layer.
-- Complements cos_continuous_learning/cos_rules with outcome-driven learning signals.

create extension if not exists pgcrypto;

create table if not exists public.cos_campaign_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  campaign_id uuid not null,
  cos_version text not null default 'unknown',
  predicted_ctr double precision,
  actual_ctr double precision,
  predicted_cvr double precision,
  actual_cvr double precision,
  predicted_watch_time double precision,
  actual_watch_time double precision,
  revenue_generated numeric,
  audit_flags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cos_campaign_outcomes_campaign_idx
  on public.cos_campaign_outcomes (campaign_id, created_at desc);
create index if not exists cos_campaign_outcomes_tenant_idx
  on public.cos_campaign_outcomes (tenant_id, created_at desc);

create table if not exists public.cos_human_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  campaign_id uuid,
  user_id uuid,
  original_output text not null,
  final_output text not null,
  edit_diff jsonb not null default '{}'::jsonb,
  feedback_type text not null check (feedback_type in ('approval','rejection','rewrite','minor_edit')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cos_human_feedback_campaign_idx
  on public.cos_human_feedback (campaign_id, created_at desc);
create index if not exists cos_human_feedback_tenant_idx
  on public.cos_human_feedback (tenant_id, created_at desc);

create table if not exists public.cos_provider_performance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  provider_name text not null,
  task_kind text not null default 'general',
  success_rate double precision,
  failure_rate double precision,
  avg_render_time double precision,
  quality_score double precision,
  sample_count integer not null default 1 check (sample_count >= 0),
  last_used timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, provider_name, task_kind)
);

create index if not exists cos_provider_performance_score_idx
  on public.cos_provider_performance (tenant_id, task_kind, quality_score desc, success_rate desc);

create table if not exists public.cos_learning_heuristics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  heuristic_name text not null,
  description text,
  weight double precision not null default 1.0,
  min_weight double precision not null default -5.0,
  max_weight double precision not null default 5.0,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  last_updated timestamptz not null default now(),
  unique nulls not distinct (tenant_id, heuristic_name)
);

create table if not exists public.cos_strategy_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  profile_name text not null,
  tone jsonb not null default '{}'::jsonb,
  pacing jsonb not null default '{}'::jsonb,
  cta jsonb not null default '{}'::jsonb,
  structure jsonb not null default '{}'::jsonb,
  provider_preferences jsonb not null default '{}'::jsonb,
  weight double precision not null default 1.0,
  metadata jsonb not null default '{}'::jsonb,
  last_updated timestamptz not null default now(),
  unique nulls not distinct (tenant_id, profile_name)
);

create or replace function public.increment_cos_heuristic_weight(
  p_tenant_id uuid,
  p_name text,
  p_delta double precision,
  p_metadata jsonb default '{}'::jsonb
)
returns double precision
language plpgsql
security definer
set search_path = public
as $$
declare
  v_weight double precision;
begin
  insert into public.cos_learning_heuristics (
    tenant_id, heuristic_name, weight, evidence_count, metadata
  ) values (
    p_tenant_id, p_name, greatest(-5.0, least(5.0, 1.0 + p_delta)), 1, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (tenant_id, heuristic_name)
  do update set
    weight = greatest(
      cos_learning_heuristics.min_weight,
      least(cos_learning_heuristics.max_weight, cos_learning_heuristics.weight + p_delta)
    ),
    evidence_count = cos_learning_heuristics.evidence_count + 1,
    metadata = cos_learning_heuristics.metadata || coalesce(p_metadata, '{}'::jsonb),
    last_updated = now()
  returning weight into v_weight;
  return v_weight;
end;
$$;

insert into public.cos_learning_heuristics (tenant_id, heuristic_name, description, weight)
values
  (null, 'ctr_weight', 'Reinforcement signal derived from actual CTR versus predicted CTR.', 1.0),
  (null, 'cvr_weight', 'Reinforcement signal derived from actual CVR versus predicted CVR.', 1.0),
  (null, 'watch_time_weight', 'Reinforcement signal derived from actual versus predicted watch time.', 1.0),
  (null, 'edit_penalty', 'Penalty signal derived from human rewrites and edits.', 1.0),
  (null, 'audit_penalty', 'Penalty signal derived from compliance and audit flags.', 1.0)
on conflict (tenant_id, heuristic_name) do nothing;

insert into public.cos_strategy_profiles (
  tenant_id, profile_name, tone, pacing, cta, structure, provider_preferences, weight
) values (
  null,
  'default',
  '{"energy":"medium","voice":"confident","humor":false}'::jsonb,
  '{"sentence_length":"medium","transitions":"balanced"}'::jsonb,
  '{"aggressiveness":"medium","placement":"end"}'::jsonb,
  '{"hook":"direct","body":"tight","close":"direct"}'::jsonb,
  '{"preferred":[],"fallback":"default"}'::jsonb,
  1.0
)
on conflict (tenant_id, profile_name) do nothing;
