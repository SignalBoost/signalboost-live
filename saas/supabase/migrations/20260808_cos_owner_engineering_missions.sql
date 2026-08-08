create table if not exists public.cos_owner_engineering_missions (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  objective text not null,
  status text not null default 'QUEUED',
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cos_owner_engineering_missions enable row level security;

create index if not exists cos_owner_engineering_missions_active_idx
  on public.cos_owner_engineering_missions(status, updated_at asc);

comment on table public.cos_owner_engineering_missions is
  'Durable owner-issued COS engineering missions. Server-side service role only; missions persist across HTTP turns until deterministic completion or an explicit block.';
