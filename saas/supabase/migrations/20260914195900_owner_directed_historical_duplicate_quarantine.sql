-- Preserve every historical owner-directed row while removing exact-material duplicate copies from
-- effective retrieval, embedding eligibility, and future promotion retries. Canonical selection keeps
-- one representative per normalized subject + normalized summary, preferring an already-completed
-- extraction row when available. A reversible audit row records the previous extraction state.

create table if not exists public.cos_continuous_learning_duplicate_quarantine (
  content_hash text primary key references public.cos_continuous_learning(content_hash) on delete restrict,
  canonical_content_hash text not null references public.cos_continuous_learning(content_hash) on delete restrict,
  subject text not null,
  material_key_hash text not null,
  previous_fact_extraction_status text,
  previous_fact_extraction_error text,
  previous_fact_extraction_attempts integer,
  quarantined_at timestamptz not null default clock_timestamp(),
  reason text not null default 'duplicate_owner_directed_material'
);

alter table public.cos_continuous_learning_duplicate_quarantine enable row level security;
revoke all on table public.cos_continuous_learning_duplicate_quarantine from public, anon, authenticated;
grant select, insert on table public.cos_continuous_learning_duplicate_quarantine to service_role;

with directed as (
  select
    l.content_hash,
    l.subject,
    l.summary,
    l.created_at,
    l.fact_extraction_status,
    l.fact_extraction_error,
    l.fact_extraction_attempts,
    pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(l.subject,''), '[[:space:]]+', ' ', 'g'))) as subject_key,
    pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(l.summary,''), '[[:space:]]+', ' ', 'g'))) as summary_key
  from public.cos_continuous_learning l
  where coalesce(l.evidence,'[]'::jsonb) @> '["owner_directed_study"]'::jsonb
    and pg_catalog.length(coalesce(l.summary,'')) >= 200
), ranked as (
  select
    d.*,
    pg_catalog.row_number() over (
      partition by d.subject_key,d.summary_key
      order by
        case when d.fact_extraction_status='completed' then 0
             when d.fact_extraction_status is null then 1
             else 2 end,
        d.created_at asc,
        d.content_hash asc
    ) as rn,
    pg_catalog.count(*) over (partition by d.subject_key,d.summary_key) as copies,
    pg_catalog.first_value(d.content_hash) over (
      partition by d.subject_key,d.summary_key
      order by
        case when d.fact_extraction_status='completed' then 0
             when d.fact_extraction_status is null then 1
             else 2 end,
        d.created_at asc,
        d.content_hash asc
    ) as canonical_content_hash
  from directed d
)
insert into public.cos_continuous_learning_duplicate_quarantine (
  content_hash,
  canonical_content_hash,
  subject,
  material_key_hash,
  previous_fact_extraction_status,
  previous_fact_extraction_error,
  previous_fact_extraction_attempts,
  quarantined_at,
  reason
)
select
  r.content_hash,
  r.canonical_content_hash,
  r.subject,
  pg_catalog.md5(r.subject_key || E'\x1f' || r.summary_key),
  r.fact_extraction_status,
  r.fact_extraction_error,
  r.fact_extraction_attempts,
  clock_timestamp(),
  'duplicate_owner_directed_material'
from ranked r
where r.copies > 1 and r.rn > 1
on conflict (content_hash) do nothing;

update public.cos_continuous_learning l
set
  fact_extraction_status='completed',
  fact_extraction_error=left(
    'relevance_rejected: duplicate_owner_directed_material canonical=' || q.canonical_content_hash ||
    case when nullif(btrim(coalesce(q.previous_fact_extraction_error,'')),'') is not null
      then '; previous_error=' || btrim(q.previous_fact_extraction_error)
      else '' end,
    1000
  ),
  fact_extraction_attempted_at=coalesce(l.fact_extraction_attempted_at, clock_timestamp())
from public.cos_continuous_learning_duplicate_quarantine q
where l.content_hash=q.content_hash
  and coalesce(l.fact_extraction_error,'') not ilike 'relevance_rejected: duplicate_owner_directed_material%';

comment on table public.cos_continuous_learning_duplicate_quarantine is
  'Reversible audit map for historical exact-material owner-directed duplicates. Original corpus rows remain stored; duplicate copies are marked relevance_rejected for effective retrieval/promotion while one canonical representative remains active.';
