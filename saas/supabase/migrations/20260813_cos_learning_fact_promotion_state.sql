-- Track fact-extraction independently of whether a learned document yields any facts.
-- This prevents valid zero-fact documents from being selected forever and starving older rows.

alter table public.cos_continuous_learning
  add column if not exists fact_extraction_status text,
  add column if not exists fact_extraction_attempts integer not null default 0,
  add column if not exists fact_extraction_attempted_at timestamptz,
  add column if not exists fact_extracted_at timestamptz,
  add column if not exists fact_extraction_error text;

alter table public.cos_continuous_learning
  drop constraint if exists cos_continuous_learning_fact_extraction_status_check;

alter table public.cos_continuous_learning
  add constraint cos_continuous_learning_fact_extraction_status_check
  check (fact_extraction_status is null or fact_extraction_status in ('completed','failed'));

create index if not exists cos_continuous_learning_fact_promotion_idx
  on public.cos_continuous_learning(fact_extraction_status, observed_at asc, confidence desc);
