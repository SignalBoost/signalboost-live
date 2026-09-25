-- Repackage only unspent undersized curriculum after the 64-source quality-floor repair.
-- Historical consumed/teacher/training work is immutable evidence and remains untouched.
update public.cos_university_distillation_curriculum_batches
set status='superseded',
    updated_at=now()
where status='prepared'
  and source_policy='public_domain_cc0_v1'
  and source_count < 64
  and dispatch_authorized=false
  and authority_expanded=false;

alter table public.cos_university_distillation_curriculum_batches
  drop constraint if exists cos_umd_prepared_quality_floor_check;
alter table public.cos_university_distillation_curriculum_batches
  add constraint cos_umd_prepared_quality_floor_check
  check (status <> 'prepared' or source_count >= 64);

comment on table public.cos_university_distillation_curriculum_batches is
  'Mass-distillation curriculum identities. New packaging uses a 64-source quality floor; historical consumed batches remain valid evidence.';
