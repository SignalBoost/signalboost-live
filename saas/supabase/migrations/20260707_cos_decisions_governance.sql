create extension if not exists pgcrypto;

create table if not exists public.cos_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_id text not null unique,
  user_id uuid,
  objective text,
  channel text,
  state text,
  required_source text,
  must_use_tool boolean not null default false,
  proposes_action boolean not null default false,
  required_approval boolean not null default false,
  approval_reasons jsonb not null default '[]'::jsonb,
  confidence numeric,
  output jsonb not null default '{}'::jsonb,
  outcome jsonb,
  status text not null default 'logged',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  executed_at timestamptz
);

create index if not exists cos_decisions_created_at_idx on public.cos_decisions (created_at desc);
create index if not exists cos_decisions_status_idx on public.cos_decisions (status, created_at desc);
create index if not exists cos_decisions_channel_idx on public.cos_decisions (channel, created_at desc);
create index if not exists cos_decisions_required_approval_idx on public.cos_decisions (required_approval, created_at desc);
