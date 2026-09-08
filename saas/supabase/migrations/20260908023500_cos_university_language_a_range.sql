-- Extend the existing COS University A-range run ledger to five platform-language targets.
-- Existing subject rows remain unchanged. Language cross-domain / Production evidence is per
-- language dimension; the language capstone is integrated and therefore has no single dimension.

alter table public.cos_university_a_range_runs
  add column if not exists target_kind text not null default 'subject',
  add column if not exists language_code text,
  add column if not exists language_dimension text;

alter table public.cos_university_a_range_runs
  alter column subject_id drop not null;

alter table public.cos_university_a_range_runs
  drop constraint if exists cos_university_a_range_target_kind_boundary,
  drop constraint if exists cos_university_a_range_language_code_boundary,
  drop constraint if exists cos_university_a_range_language_dimension_boundary,
  drop constraint if exists cos_university_a_range_target_shape_boundary;

alter table public.cos_university_a_range_runs
  add constraint cos_university_a_range_target_kind_boundary
    check (target_kind in ('subject', 'language')),
  add constraint cos_university_a_range_language_code_boundary
    check (language_code is null or language_code in ('en','es','pt','pl','ru')),
  add constraint cos_university_a_range_language_dimension_boundary
    check (language_dimension is null or language_dimension in (
      'comprehension','writing','instruction_following','translation_localization','cultural_pragmatics'
    )),
  add constraint cos_university_a_range_target_shape_boundary check (
    (
      target_kind = 'subject'
      and subject_id is not null
      and language_code is null
      and language_dimension is null
    )
    or
    (
      target_kind = 'language'
      and subject_id is null
      and language_code is not null
      and (
        (stage = 'capstone' and language_dimension is null)
        or
        (stage in ('cross_domain_transfer','production_transfer') and language_dimension is not null)
      )
    )
  );

create index if not exists cos_university_a_range_language_stage_idx
  on public.cos_university_a_range_runs (agent_id, language_code, language_dimension, stage, observed_at desc)
  where target_kind = 'language';

create index if not exists cos_university_a_range_language_variant_idx
  on public.cos_university_a_range_runs (agent_id, language_code, language_dimension, stage, variant_hash)
  where target_kind = 'language' and passed is true;

comment on column public.cos_university_a_range_runs.target_kind is
  'A-range target discriminator. Subject and five-language evidence share the same host-owned ledger.';
comment on column public.cos_university_a_range_runs.language_code is
  'Platform language for language A-range evidence. Null for subject targets.';
comment on column public.cos_university_a_range_runs.language_dimension is
  'Language dimension for transfer/Production evidence. Null for integrated language capstone rows.';

-- The existing service-only/RLS policy remains controlling. Reassert it explicitly so this
-- extension cannot accidentally widen browser access during migration replay.
alter table public.cos_university_a_range_runs enable row level security;
revoke all on table public.cos_university_a_range_runs from anon, authenticated;
grant select, insert, update, delete on table public.cos_university_a_range_runs to service_role;
