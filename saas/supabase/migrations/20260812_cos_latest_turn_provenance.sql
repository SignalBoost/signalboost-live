create table if not exists public.cos_latest_turn_provenance (
  user_id uuid primary key,
  assistant_content text not null,
  provenance jsonb not null,
  source text,
  updated_at timestamptz not null default now()
);

alter table public.cos_latest_turn_provenance enable row level security;

create index if not exists cos_latest_turn_provenance_updated_idx
  on public.cos_latest_turn_provenance (updated_at desc);
