-- Release only obsolete curriculum reservations that never entered the mass-distillation run lifecycle.
-- Production 2026-10-05: 1,305 rows remained prepared; 1,040 had no batch-run identity. Those
-- reservations prevented current failure-derived curriculum from being repackaged under the corrected
-- hybrid/remediation policy. Historical consumed work and any prepared row with a run remain immutable.
update public.cos_university_distillation_curriculum_batches b
set status = 'superseded',
    updated_at = now()
where b.status = 'prepared'
  and b.source_policy = 'public_domain_cc0_v1'
  and b.dispatch_authorized = false
  and b.authority_expanded = false
  and not exists (
    select 1
    from public.cos_university_mass_distillation_batch_runs r
    where r.batch_key = b.batch_key
  );

comment on table public.cos_university_distillation_curriculum_batches is
  'Mass-distillation curriculum identities. Unspent undispatched prepared reservations may be superseded for governed repackaging; consumed and run-bound batches remain immutable evidence.';
