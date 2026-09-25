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

comment on table public.cos_university_distillation_curriculum_batches is
  'Mass-distillation curriculum identities. New packaging uses a 64-source quality floor; historical consumed batches remain valid evidence.';
