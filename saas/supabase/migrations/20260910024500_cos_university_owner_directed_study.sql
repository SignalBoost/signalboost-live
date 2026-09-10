-- Admit owner-directed material as a University study-plan source.
-- This changes plan provenance only; ordinary study remains unable to write academic grades.

alter table public.cos_university_study_plans
  drop constraint if exists cos_university_study_plans_source_kind_check;

alter table public.cos_university_study_plans
  add constraint cos_university_study_plans_source_kind_check check (source_kind in (
    'failure_autopsy','operational_weakness','academic_rotation','language_rotation','recertification',
    'owner_directed_material'
  ));

comment on table public.cos_university_study_plans is
  'Durable remediation/continuing-education queue, including owner-directed admitted material. Plans and study proofs never promote academic grades.';
