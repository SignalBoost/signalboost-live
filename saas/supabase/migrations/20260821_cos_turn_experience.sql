create table if not exists public.cos_turn_experience (
  turn_id uuid primary key,
  prompt_hash text not null,
  features jsonb not null default '{}'::jsonb,
  surface_difficulty text not null,
  reasoner_label text not null,
  phases jsonb not null default '[]'::jsonb,
  skipped jsonb not null default '[]'::jsonb,
  total_ms integer not null default 0 check (total_ms >= 0),
  model_call_ms integer not null default 0 check (model_call_ms >= 0),
  other_ms integer not null default 0 check (other_ms >= 0),
  model_calls integer not null default 0 check (model_calls >= 0),
  answered boolean not null default false,
  repair_needed boolean,
  escalated boolean,
  user_feedback text,
  verified_success boolean,
  outcome_at timestamptz,
  outcome_source text,
  created_at timestamptz not null default now()
);

create index if not exists cos_turn_experience_created_at_idx
  on public.cos_turn_experience (created_at desc);
create index if not exists cos_turn_experience_reasoner_difficulty_idx
  on public.cos_turn_experience (reasoner_label, surface_difficulty, created_at desc);
create index if not exists cos_turn_experience_prompt_hash_idx
  on public.cos_turn_experience (prompt_hash, created_at desc);
create index if not exists cos_turn_experience_outcome_at_idx
  on public.cos_turn_experience (outcome_at desc)
  where outcome_at is not null;

comment on table public.cos_turn_experience is
  'COS per-turn execution telemetry for metacognitive routing analysis. Stores prompt hashes/features, phase costs/skips and later outcomes; never raw prompts.';
comment on column public.cos_turn_experience.model_calls is
  'Count of directly instrumented model phases; a lower bound until provider-boundary request correlation includes internal Council/challenge calls.';
