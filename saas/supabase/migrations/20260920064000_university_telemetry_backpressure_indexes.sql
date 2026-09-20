-- Match COS University telemetry's actual Production read patterns.
-- These indexes reduce full-table scans/sorts during owner telemetry refreshes and do not change
-- authority, lifecycle, training cadence, or data semantics.

create index if not exists cos_mass_runs_updated_desc_idx
  on public.cos_university_mass_distillation_batch_runs (updated_at desc);

create index if not exists cos_mass_campaigns_updated_desc_idx
  on public.cos_university_mass_distillation_campaigns (updated_at desc);

create index if not exists cos_mass_teacher_rows_created_desc_idx
  on public.cos_university_mass_hosted_teacher_rows (created_at desc);

create index if not exists cos_mass_provider_jobs_dispatched_desc_idx
  on public.cos_university_mass_distillation_provider_jobs (dispatched_at desc);

create index if not exists cos_mass_provider_jobs_run_updated_desc_idx
  on public.cos_university_mass_distillation_provider_jobs (run_id, updated_at desc);
