-- Keep the University Self-Healing / distillation cron on indexed hot paths.
-- These indexes do not widen authority or change lifecycle semantics.

create index if not exists cos_mass_provider_jobs_unsettled_dispatched_idx
  on public.cos_university_mass_distillation_provider_jobs (dispatched_at)
  where settled_at is null;

create index if not exists cos_mass_campaigns_status_updated_idx
  on public.cos_university_mass_distillation_campaigns (status, updated_at);

create index if not exists cos_mass_runs_campaign_stage_updated_idx
  on public.cos_university_mass_distillation_batch_runs (campaign_id, stage, updated_at);

create index if not exists cos_mass_runs_batch_stage_idx
  on public.cos_university_mass_distillation_batch_runs (batch_key, stage);

create index if not exists cos_mass_curriculum_prepared_idx
  on public.cos_university_distillation_curriculum_batches (prepared_at, batch_key)
  where status = 'prepared'
    and dispatch_authorized = false
    and authority_expanded = false;

create index if not exists cos_learning_assurance_dispatch_lookup_idx
  on public.cos_university_learning_assurance_events (candidate_id, observed_at desc)
  where event_type = 'fine_tune'
    and verifier = 'host_controller';
