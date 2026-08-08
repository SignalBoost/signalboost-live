create table if not exists public.cos_autonomy_state (
  mission_id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cos_autonomy_state enable row level security;

comment on table public.cos_autonomy_state is 'Server-side durable state for COS autonomous mission leadership ticks.';
