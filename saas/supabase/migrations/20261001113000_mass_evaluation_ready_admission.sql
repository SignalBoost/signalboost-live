-- Separate "qualified for evaluation" from "admitted to evaluation".
-- Training completion writes evaluation_ready. Only a bounded, live evaluator approval may
-- promote the exact artifact to evaluation_pending. This keeps pending equal to admitted work.

create or replace function public.enforce_mass_artifact_evaluation_pending_admission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'evaluation_pending'
     and new.candidate_id like 'mass:%'
     and (tg_op = 'INSERT' or old.status is distinct from 'evaluation_pending') then
    if not exists (
      select 1
      from public.cos_university_mass_distillation_batch_runs r
      where r.candidate_id = new.candidate_id
        and r.stage = 'complete'
        and r.completed_at is not null
        and r.trained_artifact_id = new.trained_artifact_id
        and r.trained_artifact_hash = new.trained_artifact_hash
        and r.revision_key = new.revision_key
        and r.dataset_hash = new.dataset_hash
        and nullif(btrim(r.training_data_ref), '') is not null
        and nullif(btrim(r.holdout_data_ref), '') is not null
        and r.training_manifest_hash ~ '^[a-f0-9]{64}$'
        and r.holdout_manifest_hash ~ '^[a-f0-9]{64}$'
        and nullif(btrim(r.evidence_ref), '') is not null
        and nullif(btrim(r.rollback_artifact_ref), '') is not null
    ) then
      raise exception 'mass_artifact_evaluation_admission_prerequisites_missing:%', new.candidate_id
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.cos_university_learning_assurance_events e
      where e.candidate_id = new.candidate_id
        and e.event_type = 'fine_tune'
        and e.verifier = 'host_controller'
        and e.evidence->>'claim' = 'distilled_independent_evaluation_approved'
        and lower(coalesce(e.evidence->>'artifactHash','')) = lower(new.trained_artifact_hash)
        and e.expires_at > now()
    ) then
      raise exception 'mass_artifact_evaluation_admission_approval_missing:%', new.candidate_id
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Existing pending rows are preserved for explicit reconciliation; no evidence is rewritten here.
