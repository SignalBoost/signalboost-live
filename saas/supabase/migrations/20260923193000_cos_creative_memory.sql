-- COS Creative Memory: reusable successful approaches, not factual evidence.
-- Uses the same active 768-dimensional embedding space as existing COS semantic stores.
-- Creative Memory may guide structure/style/strategy but MUST NOT ground factual claims.

create table if not exists public.cos_creative_memory (
  id text primary key,
  fingerprint text not null unique,
  audience text not null default 'owner'
    check (audience in ('public','owner')),
  task_type text not null,
  context_summary text not null default '',
  approach text not null,
  useful_elements jsonb not null default '[]'::jsonb,
  style text,
  constraints jsonb not null default '[]'::jsonb,
  outcome_summary text,
  quality_score double precision not null default 0.5
    check (quality_score >= 0 and quality_score <= 1),
  source_kind text not null default 'validated_outcome',
  source_ref text,
  status text not null default 'approved'
    check (status in ('approved','quarantined','retired')),
  language text not null default 'en',
  training_eligible boolean not null default false,
  embedding vector(768),
  embedding_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cos_creative_memory_status_quality_idx
  on public.cos_creative_memory (status, audience, quality_score desc, updated_at desc);

create index if not exists cos_creative_memory_embedding_hnsw_idx
  on public.cos_creative_memory
  using hnsw (embedding vector_cosine_ops);

create or replace function public.cos_match_creative_memory(
  query_embedding vector(768),
  match_count integer default 8,
  min_similarity double precision default 0.42,
  match_embedding_model text default null,
  match_audience text default 'owner'
)
returns table (
  id text,
  task_type text,
  context_summary text,
  approach text,
  useful_elements jsonb,
  style text,
  constraints jsonb,
  outcome_summary text,
  quality_score double precision,
  source_kind text,
  source_ref text,
  language text,
  training_eligible boolean,
  similarity double precision
)
language sql stable
as $$
  select
    memory.id,
    memory.task_type,
    memory.context_summary,
    memory.approach,
    memory.useful_elements,
    memory.style,
    memory.constraints,
    memory.outcome_summary,
    memory.quality_score,
    memory.source_kind,
    memory.source_ref,
    memory.language,
    memory.training_eligible,
    1 - (memory.embedding <=> query_embedding) as similarity
  from public.cos_creative_memory as memory
  where memory.status = 'approved'
    and memory.embedding is not null
    and (match_embedding_model is null or memory.embedding_model = match_embedding_model)
    and (memory.audience = 'public' or memory.audience = match_audience)
    and 1 - (memory.embedding <=> query_embedding) >= greatest(0, least(1, min_similarity))
  order by memory.embedding <=> query_embedding,
           memory.quality_score desc,
           memory.updated_at desc,
           memory.id asc
  limit greatest(1, least(match_count, 24));
$$;

-- Generic, owner-approved creative patterns. These are methods, never factual evidence.
insert into public.cos_creative_memory (
  id, fingerprint, audience, task_type, context_summary, approach, useful_elements,
  style, constraints, outcome_summary, quality_score, source_kind, source_ref, status, language, training_eligible
) values
(
  'cm_short_budget_city_itinerary_v1',
  'short_budget_city_itinerary_v1',
  'public',
  'short_budget_city_itinerary',
  'A user has a limited city visit or layover, wants low cost, transport details, and one worthwhile paid experience.',
  'Complete the itinerary without making the user ask again: choose a geographically coherent walking route, name concrete stops, include airport-to-center and return transport, one high-value paid anchor, a low-cost food option, a simple cost summary, and a realistic return-time buffer. Add one or two directly useful variants only after completing the main plan.',
  '["named stops","logical walking cluster","transport both directions","one paid anchor","budget food","cost summary","return buffer","optional variants"]'::jsonb,
  'practical, specific, concise, locally aware',
  '["Do not invent current fares or opening hours.","Do not treat a transport-only source as an attraction.","Mutable details require live evidence."]'::jsonb,
  'Higher-quality short-trip answers are complete, concrete, geographically coherent, budget-aware, and proactive without becoming verbose.',
  0.92,
  'owner_validated_quality_pattern',
  'platform-quality:travel-completion',
  'approved',
  'en',
  false
),
(
  'cm_conversation_transform_continuity_v1',
  'conversation_transform_continuity_v1',
  'public',
  'conversation_transformation',
  'A follow-up asks to translate, rewrite, summarize, shorten, or otherwise transform what the assistant just wrote.',
  'Bind the immediately preceding assistant answer as the source artifact. Apply the new instruction to that artifact, not to the literal wording of the new instruction. Preserve the whole referenced answer unless the user explicitly narrows the scope.',
  '["previous-answer binding","full-artifact transformation","instruction/source separation","conversation continuity"]'::jsonb,
  'faithful, complete',
  '["Never translate only the instruction when it refers to the prior answer.","Prior assistant text is an artifact here, not factual evidence."]'::jsonb,
  'Conversation transforms succeed when reference resolution is explicit and the entire intended artifact is transformed.',
  0.95,
  'owner_validated_quality_pattern',
  'platform-quality:conversation-transform',
  'approved',
  'en',
  false
),
(
  'cm_proactive_completion_v1',
  'proactive_completion_v1',
  'public',
  'proactive_completion',
  'The user has a clear goal and a complete answer can be improved by one or two obvious adjacent options.',
  'Finish the requested task first. Then volunteer at most one or two concrete, directly connected continuations that save the user another turn, such as a cheaper variant, bad-weather alternative, map/route version, implementation next step, or comparison. Do not end with a generic offer when a specific useful option is apparent.',
  '["complete main task first","one or two concrete continuations","goal-adjacent initiative","no generic menu padding"]'::jsonb,
  'helpful, anticipatory, restrained',
  '["Do not perform consequential extra actions without authorization.","Do not add irrelevant suggestions.","Do not substitute suggestions for completion."]'::jsonb,
  'Strong assistant behavior anticipates the next practical need after fully solving the current one.',
  0.90,
  'owner_validated_quality_pattern',
  'platform-quality:proactive-completion',
  'approved',
  'en',
  false
)
on conflict (id) do nothing;

alter table public.cos_creative_memory enable row level security;
