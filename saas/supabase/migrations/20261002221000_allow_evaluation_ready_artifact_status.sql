-- Keep the trained-artifact lifecycle aligned with the governed evaluator admission flow.
-- evaluation_ready means the artifact exists durably but has not yet received its bounded live evaluation approval.
alter table public.cos_local_distillation_artifacts
  drop constraint if exists cos_local_distillation_artifacts_status_check;

alter table public.cos_local_distillation_artifacts
  add constraint cos_local_distillation_artifacts_status_check
  check (status in (
    'trained_pending_rollback',
    'evaluation_ready',
    'evaluation_pending',
    'runtime_pending',
    'active',
    'quarantined',
    'retired'
  ));
