-- saas/supabase/migrations/verify/20260912_university_execution_binding_check.sql
-- SELECT-shaped. Run in the SQL editor (or Hub -> Run Migration). Writes nothing.
-- Reports, per academic ledger: does the column exist, does the binding constraint exist,
-- and how many historical rows are present (so the same query proves preservation after apply).
select 'cos_university_exam_runs' as ledger,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='cos_university_exam_runs' and column_name='agent_id') as agent_id_col,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='cos_university_exam_runs' and column_name='execution_provenance') as execution_provenance_col,
  (select count(*) from pg_constraint
     where conrelid = to_regclass('public.cos_university_exam_runs')
       and conname in ('cos_university_exam_run_identity_v1','cos_university_exam_execution_binding_v1')) as binding_constraints,
  (select count(*) from public.cos_university_exam_runs) as rows_total
union all
select 'cos_university_a_range_runs',
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='cos_university_a_range_runs' and column_name='agent_id'),
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='cos_university_a_range_runs' and column_name='execution_provenance'),
  (select count(*) from pg_constraint
     where conrelid = to_regclass('public.cos_university_a_range_runs')
       and conname = 'cos_university_a_range_execution_binding_v1'),
  (select count(*) from public.cos_university_a_range_runs)
union all
select 'cos_university_retention_runs',
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='cos_university_retention_runs' and column_name='agent_id'),
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='cos_university_retention_runs' and column_name='execution_provenance'),
  (select count(*) from pg_constraint
     where conrelid = to_regclass('public.cos_university_retention_runs')
       and conname = 'cos_university_retention_execution_binding_v1'),
  (select count(*) from public.cos_university_retention_runs)
union all
select 'cos_university_generalist_capstone_runs',
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='cos_university_generalist_capstone_runs' and column_name='agent_id'),
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='cos_university_generalist_capstone_runs' and column_name='execution_provenance'),
  (select count(*) from pg_constraint
     where conrelid = to_regclass('public.cos_university_generalist_capstone_runs')
       and conname = 'cos_university_capstone_execution_binding_v1'),
  (select count(*) from public.cos_university_generalist_capstone_runs)
union all
select 'graduation_remediation_gate',
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='read_cos_university_undergraduate_remediation'),
  (select count(*) from pg_trigger
     where tgrelid = to_regclass('public.cos_university_credentials')
       and tgname='cos_university_credential_remediation_guard'),
  (select count(*) from pg_trigger
     where tgrelid = to_regclass('public.cos_university_study_plans')
       and tgname='cos_university_remediation_write_fence'),
  (select count(*) from public.cos_university_credentials)
