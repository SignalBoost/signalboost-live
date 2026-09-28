-- saas/supabase/migrations/20260928030000_cos_university_holdout_exam_items.sql
-- Real Holdout exam questions (owner decision 2026-09-27).
-- Each withheld holdout teaching essay gets ONE self-contained exam question and a short answer key, keyed by the
-- holdout item's immutable hash. The evaluator asks the question and grades against the key instead of asking both
-- models to "generate a teaching example" and grading their different examples against one specific essay
-- (279 of 529 Holdout failures were both-zero for that reason).

create table if not exists public.cos_university_holdout_exam_items (
  item_hash text primary key check (item_hash ~ '^[a-f0-9]{64}$'),
  profile text not null,
  subject_id text,
  question text not null check (char_length(question) between 20 and 1200),
  answer_key text not null check (char_length(answer_key) between 1 and 800),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  writer_provider text not null,
  writer_model text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cos_university_holdout_exam_sets (
  candidate_id text not null,
  trained_artifact_hash text not null check (trained_artifact_hash ~ '^[a-f0-9]{64}$'),
  holdout_manifest_hash text check (holdout_manifest_hash is null or holdout_manifest_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('requested', 'ready', 'failed')),
  item_hashes text[] not null default '{}',
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (candidate_id, trained_artifact_hash)
);

create index if not exists cos_university_holdout_exam_sets_queue_idx
  on public.cos_university_holdout_exam_sets (status, updated_at);

alter table public.cos_university_holdout_exam_items enable row level security;
alter table public.cos_university_holdout_exam_sets enable row level security;
revoke all on table public.cos_university_holdout_exam_items from public, anon, authenticated;
revoke all on table public.cos_university_holdout_exam_sets from public, anon, authenticated;
grant select, insert, update on table public.cos_university_holdout_exam_items to service_role;
grant select, insert, update on table public.cos_university_holdout_exam_sets to service_role;

comment on table public.cos_university_holdout_exam_items is
  'One real exam question + short answer key per withheld holdout teaching essay, written by a governed University teacher. Keyed by the immutable holdout item hash.';
comment on table public.cos_university_holdout_exam_sets is
  'Per-artifact readiness of Holdout exam items. The evaluation route only approves artifacts whose set is ready and requests the rest.';
