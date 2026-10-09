-- saas/supabase/migrations/20261009200000_eleven_language_platform.sql
-- iTMounts runs 11 first-class languages: en, es, pt, pl, ru, de, fr, it, ja, ko, ar.
-- Widen every language CHECK constraint that still admits only the original five, so
-- Concierge acceptance, COS University and generated-content translation rows can be
-- written for German, French, Italian, Japanese, Korean and Arabic. Existing rows are
-- untouched (the new sets are strict supersets of the old ones).

do $$
declare
  target record;
  constraint_name text;
begin
  for target in
    select * from (values
      ('concierge_language_acceptance_results', 'language'),
      ('cos_university_a_range_runs', 'language_code'),
      ('cos_university_exam_runs', 'language_code'),
      ('cos_university_assessments', 'language_code'),
      ('cos_university_study_plans', 'language_code'),
      ('generated_content_translations', 'source_language'),
      ('generated_content_translations', 'target_language')
    ) as t(table_name, column_name)
  loop
    if to_regclass('public.' || target.table_name) is null then
      continue;
    end if;
    -- Drop the five-language CHECK on this column, whatever name Postgres gave it.
    for constraint_name in
      select c.conname
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      join pg_attribute a on a.attrelid = r.oid and a.attnum = any (c.conkey)
      where n.nspname = 'public'
        and r.relname = target.table_name
        and a.attname = target.column_name
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) like '%''ru''%'
    loop
      execute format('alter table public.%I drop constraint %I', target.table_name, constraint_name);
    end loop;

    execute format(
      'alter table public.%I add constraint %I check (%I is null or %I in (''en'',''es'',''pt'',''pl'',''ru'',''de'',''fr'',''it'',''ja'',''ko'',''ar''))',
      target.table_name,
      target.table_name || '_' || target.column_name || '_language_check',
      target.column_name,
      target.column_name
    );
  end loop;
end $$;

-- New acceptance runs start with a pending native review for every platform language.
do $$
begin
  if to_regclass('public.concierge_language_acceptance_runs') is not null then
    alter table public.concierge_language_acceptance_runs
      alter column native_reviews set default
        '{"en":"pending","es":"pending","pt":"pending","pl":"pending","ru":"pending","de":"pending","fr":"pending","it":"pending","ja":"pending","ko":"pending","ar":"pending"}'::jsonb;
  end if;
end $$;
