-- COS adaptive retrieval, phase 1: outcome-derived shadow policy + independent controlled validation.
--
-- No live retrieval threshold or top-k changes are stored here as executable policy. The policy table
-- records hypotheses and validation state only. A request-local shadow context is required to apply a
-- candidate during validation, so ordinary Production traffic keeps the existing retrieval behavior.

alter table public.cos_evidence_source_use
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists retrieval_policy jsonb not null default '{}'::jsonb;

comment on column public.cos_evidence_source_use.items is
  'Prompt-free per-item learned-corpus retrieval telemetry: source kind, similarity, content hash, summary size, selected index and citation-use flag.';
comment on column public.cos_evidence_source_use.retrieval_policy is
  'Request-local shadow retrieval policy metadata. Empty object means ordinary live retrieval policy.';

create table if not exists public.cos_adaptive_retrieval_policies (
  id uuid primary key default gen_random_uuid(),
  evidence_system text not null default 'learned_corpus' check (evidence_system in ('learned_corpus')),
  scope_key text not null default 'global',
  status text not null default 'shadow_candidate'
    check (status in ('shadow_candidate','validation_pending','validated_shadow','rejected')),
  training_hash text not null unique,
  current_policy jsonb not null default '{}'::jsonb,
  candidate_policy jsonb not null default '{}'::jsonb,
  training_metrics jsonb not null default '{}'::jsonb,
  training_case_ids text[] not null default '{}'::text[],
  validation_required integer not null default 2 check (validation_required between 1 and 12),
  validation_passed integer not null default 0 check (validation_passed >= 0),
  validation_failed integer not null default 0 check (validation_failed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cos_adaptive_retrieval_policies_status_idx
  on public.cos_adaptive_retrieval_policies(status, updated_at desc);
create index if not exists cos_adaptive_retrieval_policies_scope_idx
  on public.cos_adaptive_retrieval_policies(evidence_system, scope_key, updated_at desc);

create table if not exists public.cos_adaptive_retrieval_validations (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.cos_adaptive_retrieval_policies(id) on delete cascade,
  case_id text not null,
  case_domain text not null,
  baseline_turn_id uuid,
  candidate_turn_id uuid,
  baseline_passed boolean not null,
  candidate_passed boolean not null,
  baseline_injected integer not null default 0 check (baseline_injected >= 0),
  candidate_injected integer not null default 0 check (candidate_injected >= 0),
  baseline_latency_ms integer not null default 0 check (baseline_latency_ms >= 0),
  candidate_latency_ms integer not null default 0 check (candidate_latency_ms >= 0),
  verdict text not null check (verdict in ('passed','failed','inconclusive')),
  reasons text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  unique(policy_id, case_id)
);

create index if not exists cos_adaptive_retrieval_validations_policy_idx
  on public.cos_adaptive_retrieval_validations(policy_id, created_at desc);

alter table public.cos_adaptive_retrieval_policies enable row level security;
alter table public.cos_adaptive_retrieval_validations enable row level security;
revoke all on public.cos_adaptive_retrieval_policies from anon, authenticated;
revoke all on public.cos_adaptive_retrieval_validations from anon, authenticated;

comment on table public.cos_adaptive_retrieval_policies is
  'Outcome-derived retrieval hypotheses. validated_shadow is evidence of a safe candidate, not automatic live-policy promotion.';
comment on table public.cos_adaptive_retrieval_validations is
  'Paired baseline vs request-local shadow retrieval validation on controlled cases excluded from policy training.';
