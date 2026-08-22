-- COS reasoning worker outcome-learning telemetry.
-- No raw prompt or answer text is persisted here. turn_id correlates execution metrics to the
-- independent cos_turn_outcomes table after verified outcomes arrive.

create table if not exists public.cos_reasoning_worker_metrics (
  turn_id uuid primary key,
  problem_class text not null,
  worker_role text not null check (worker_role in ('primary','coder','critic','verifier','researcher')),
  reasoner_label text not null,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  estimated_input_tokens integer not null default 0 check (estimated_input_tokens >= 0),
  estimated_output_tokens integer not null default 0 check (estimated_output_tokens >= 0),
  estimated_cost_usd numeric(18,9),
  pricing_configured boolean not null default false,
  recorded_at timestamptz not null default now()
);

create index if not exists cos_reasoning_worker_metrics_problem_idx
  on public.cos_reasoning_worker_metrics(problem_class, recorded_at desc);
create index if not exists cos_reasoning_worker_metrics_candidate_idx
  on public.cos_reasoning_worker_metrics(problem_class, worker_role, reasoner_label, recorded_at desc);

comment on table public.cos_reasoning_worker_metrics is
  'Provider-neutral COS worker execution metrics keyed by turn_id. Quality arrives independently through cos_turn_outcomes; token counts and monetary cost are explicitly estimates until provider billing usage is captured.';

alter table public.cos_reasoning_worker_metrics enable row level security;
revoke all on public.cos_reasoning_worker_metrics from anon, authenticated;
