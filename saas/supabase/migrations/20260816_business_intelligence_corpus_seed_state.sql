create table if not exists public.business_intelligence_corpus_seed_state (
  source text primary key,
  raw_offset bigint not null default 0 check (raw_offset >= 0),
  runs bigint not null default 0 check (runs >= 0),
  last_result jsonb not null default '{}'::jsonb,
  last_succeeded_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.business_intelligence_corpus_seed_state enable row level security;

revoke all on table public.business_intelligence_corpus_seed_state from anon, authenticated;
grant all on table public.business_intelligence_corpus_seed_state to service_role;

insert into public.business_intelligence_corpus_seed_state (source, raw_offset, runs, last_result)
values ('wikidata', 0, 0, '{}'::jsonb)
on conflict (source) do nothing;
