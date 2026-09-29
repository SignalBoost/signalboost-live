create table if not exists public.cos_learning_indexer_telemetry (
  id text primary key check (id = 'continuous_indexer'),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  status text not null default 'unknown',
  attempted integer not null default 0,
  embedded integer not null default 0,
  failed integer not null default 0,
  pending_before integer,
  pending_after integer,
  duration_ms integer,
  error text,
  updated_at timestamptz not null default now()
);

alter table public.cos_learning_indexer_telemetry enable row level security;

comment on table public.cos_learning_indexer_telemetry is
  'Owner-facing durable proof of the automatic learned-corpus embedding indexer. Service-role writes; owner admin API reads.';
