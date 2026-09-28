-- Durable observability for University graduate serving attempts.
-- Separate from cos_reasoning_worker_metrics: that table intentionally represents successful
-- executions used by outcome learning. This table records attempts/fallbacks without prompt/answer text.

create table if not exists public.cos_university_graduate_serving_attempts (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  correlation_id text,
  registry_id uuid not null,
  candidate_id text not null,
  trained_artifact_hash text not null,
  subject_id text not null,
  problem_class text not null,
  worker_role text not null check (worker_role in ('primary','coder','critic','verifier','researcher','context_engineer')),
  runtime_provider text not null,
  runtime_model_id text not null,
  runtime_base_url text not null,
  phase text not null check (phase in ('attempt_started','attempt_succeeded','attempt_failed','fallback')),
  outcome text not null check (outcome in ('pending','success','empty','timeout','error','fallback')),
  timeout_ms integer,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  error_class text,
  recorded_at timestamptz not null default now()
);

create index if not exists cos_university_graduate_serving_attempts_attempt_idx
  on public.cos_university_graduate_serving_attempts(attempt_id, recorded_at);
create index if not exists cos_university_graduate_serving_attempts_recent_idx
  on public.cos_university_graduate_serving_attempts(recorded_at desc);
create index if not exists cos_university_graduate_serving_attempts_runtime_idx
  on public.cos_university_graduate_serving_attempts(runtime_model_id, recorded_at desc);

comment on table public.cos_university_graduate_serving_attempts is
  'Sanitized graduate serving lifecycle telemetry. Records selection/attempt/success/failure/fallback identity and timing without prompt, answer, secrets, or authority.';
alter table public.cos_university_graduate_serving_attempts enable row level security;
revoke all on public.cos_university_graduate_serving_attempts from anon, authenticated;
