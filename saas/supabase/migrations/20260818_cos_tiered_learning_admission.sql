-- Tiered COS learning admission: preserve conditional evidence without lowering durable-knowledge standards.
create table if not exists public.cos_learning_probationary (
  content_hash text primary key,
  claim_fingerprint text not null,
  source_kind text not null,
  source_uri text not null,
  source_title text,
  observed_at timestamptz not null,
  subject text not null,
  summary text not null,
  facts jsonb not null default '[]'::jsonb,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  raw_relevance double precision not null check (raw_relevance >= 0 and raw_relevance <= 1),
  gap_adjusted_relevance double precision not null check (gap_adjusted_relevance >= 0 and gap_adjusted_relevance <= 1),
  source_floor double precision not null check (source_floor >= 0 and source_floor <= 1),
  gap_aligned boolean not null default false,
  corroboration_required boolean not null default true,
  admission_reason text not null,
  status text not null default 'probationary' check (status in ('probationary', 'promoted', 'rejected', 'superseded')),
  license text,
  evidence jsonb not null default '[]'::jsonb,
  promoted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists cos_learning_probationary_claim_idx
  on public.cos_learning_probationary(claim_fingerprint, status, observed_at desc);
create index if not exists cos_learning_probationary_subject_idx
  on public.cos_learning_probationary(subject, status, observed_at desc);

alter table public.cos_learning_probationary enable row level security;
