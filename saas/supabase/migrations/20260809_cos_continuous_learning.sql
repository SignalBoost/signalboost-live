-- Durable provenance-aware store for COS Continuous Learning.
-- Learned material is corporate knowledge and must survive deploys/provider changes.

create table if not exists public.cos_continuous_learning (
  content_hash text primary key,
  source_kind text not null,
  source_uri text not null,
  source_title text,
  observed_at timestamptz not null,
  subject text not null,
  summary text not null,
  facts jsonb not null default '[]'::jsonb,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  license text,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cos_continuous_learning_subject_idx
  on public.cos_continuous_learning(subject, observed_at desc);
create index if not exists cos_continuous_learning_source_idx
  on public.cos_continuous_learning(source_kind, observed_at desc);

alter table public.cos_continuous_learning enable row level security;
