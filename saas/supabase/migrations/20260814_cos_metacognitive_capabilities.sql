-- COS metacognition: durable workload-relative capability state.
--
-- This table is descriptive evidence, not an answer-confidence source. It records whether a problem
-- class currently has strong, developing, weak, untested, or internally conflicted procedural
-- capability based on validated skills, unresolved gaps, retention and verified production outcomes.

create table if not exists public.cos_metacognitive_capabilities (
  id uuid primary key default gen_random_uuid(),
  capability_key text not null unique,
  label text not null,
  region text not null check (region in ('strong','developing','weak','untested','conflicted')),
  reliability double precision not null check (reliability >= 0 and reliability <= 1),
  evidence jsonb not null default '{}'::jsonb,
  last_assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cos_metacognitive_capabilities_region_idx
  on public.cos_metacognitive_capabilities(region, last_assessed_at desc);

alter table public.cos_metacognitive_capabilities enable row level security;

comment on table public.cos_metacognitive_capabilities is
  'COS metacognitive capability map. Regions summarize procedural evidence and unresolved gaps; reliability is selection/coverage evidence only and must never be copied into answer confidence.';
