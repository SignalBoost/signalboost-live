create extension if not exists pgcrypto;

create table if not exists public.cos_capability_benchmark_candidates (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  track text not null default 'general',
  sanitized_prompt text not null,
  required_terms jsonb not null default '[]'::jsonb,
  forbidden_terms jsonb not null default '[]'::jsonb,
  requires_local_reasoning boolean not null default true,
  failure_kind text not null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  status text not null default 'pending' check (status in ('pending','promoted','rejected')),
  source_metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  promoted_case_id uuid references public.cos_capability_benchmark_cases(id) on delete set null,
  promoted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists cos_capability_benchmark_candidates_status_idx
  on public.cos_capability_benchmark_candidates(status, occurrence_count desc, last_seen_at desc);

alter table public.cos_capability_benchmark_cases
  add column if not exists origin text not null default 'manual',
  add column if not exists source_candidate_id uuid references public.cos_capability_benchmark_candidates(id) on delete set null,
  add column if not exists difficulty_score double precision not null default 1.0,
  add column if not exists promoted_at timestamptz;

create unique index if not exists cos_capability_benchmark_cases_source_candidate_uidx
  on public.cos_capability_benchmark_cases(source_candidate_id)
  where source_candidate_id is not null;

create or replace function public.record_cos_benchmark_candidate(
  p_fingerprint text,
  p_track text,
  p_sanitized_prompt text,
  p_required_terms jsonb,
  p_forbidden_terms jsonb,
  p_requires_local_reasoning boolean,
  p_failure_kind text,
  p_source_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.cos_capability_benchmark_candidates (
    fingerprint, track, sanitized_prompt, required_terms, forbidden_terms,
    requires_local_reasoning, failure_kind, source_metadata
  ) values (
    p_fingerprint,
    coalesce(nullif(trim(p_track), ''), 'general'),
    p_sanitized_prompt,
    coalesce(p_required_terms, '[]'::jsonb),
    coalesce(p_forbidden_terms, '[]'::jsonb),
    coalesce(p_requires_local_reasoning, true),
    p_failure_kind,
    coalesce(p_source_metadata, '{}'::jsonb)
  )
  on conflict (fingerprint) do update set
    occurrence_count = cos_capability_benchmark_candidates.occurrence_count + 1,
    last_seen_at = now(),
    failure_kind = excluded.failure_kind,
    source_metadata = cos_capability_benchmark_candidates.source_metadata || excluded.source_metadata
  returning id into v_id;

  return v_id;
end;
$$;
