-- saas/supabase/migrations/20260821_cos_evidence_source_use.sql
--
-- Learned-corpus source-kind utilization joined to COS turn telemetry by turn_id.
-- No raw prompt, answer, or source URI text is stored.

create table if not exists public.cos_evidence_source_use (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid not null,
  evidence_system text not null default 'learned_corpus'
    check (evidence_system = 'learned_corpus'),
  created_at timestamptz not null default now(),
  injected integer not null check (injected > 0),
  cited integer not null default 0 check (cited >= 0 and cited <= injected),
  -- [{ sourceKind, injected, cited }]
  by_source_kind jsonb not null default '[]'::jsonb,
  unique (turn_id, evidence_system)
);

create index if not exists cos_evidence_source_use_created_idx
  on public.cos_evidence_source_use(created_at desc);
create index if not exists cos_evidence_source_use_turn_idx
  on public.cos_evidence_source_use(turn_id);

comment on table public.cos_evidence_source_use is
  'Per-turn learned-corpus source-kind utilization. turn_id correlates to cos_turn_experience outcomes; no FK is used because both post-response telemetry writes are intentionally independent and may race. Stores no prompt, answer, or URI text.';

alter table public.cos_evidence_source_use enable row level security;
revoke all on public.cos_evidence_source_use from anon, authenticated;
