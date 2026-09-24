import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path:string){return readFileSync(new URL('../'+path,import.meta.url),'utf8')}

test('Working COS dispatcher is doubly fail-closed and explicitly owner-confirmed',()=>{
  const dispatch=source('lib/ai/cos/cosWorkingDistillationDispatch.ts')
  const route=source('app/api/admin/cos-working-distillation/route.ts')
  const env=source('.env.example')

  assert.match(dispatch,/requireExplicitTrainingDispatchConfirmation/)
  assert.match(dispatch,/COS_WORKING_DISTILLATION_DISPATCH_ENABLED/)
  assert.match(dispatch,/trainingExecutorConfigFromEnv/)
  assert.match(dispatch,/dispatchEnabled/)
  assert.match(route,/await requireOwner\(\)/)
  assert.match(route,/operation === 'prepare_dataset'/)
  assert.match(route,/operation === 'train'/)
  assert.match(route,/confirmDispatch: body\?\.confirmDispatch/)
  assert.match(env,/COS_WORKING_DISTILLATION_DISPATCH_ENABLED=false/)
  assert.match(env,/COS_WORKING_DISTILLATION_HF_TRAINING_FLAVOR=/)
})

test('Working COS dispatch re-proves exact runtime digest and pinned HF base revision before spend',()=>{
  const dispatch=source('lib/ai/cos/cosWorkingDistillationDispatch.ts')
  const binding=source('lib/ai/cos/cosWorkingRuntimeBinding.ts')

  assert.match(dispatch,/queryWorkingCosRuntimeIdentity/)
  assert.match(dispatch,/workingCosRuntimeBindingFromEnv/)
  assert.match(dispatch,/resolveHuggingFaceModelMetadata/)
  assert.match(dispatch,/working_cos_trainable_base_revision_drift/)
  assert.match(dispatch,/metadata\.license !== 'apache-2\.0'/)
  assert.match(binding,/ad815644918f0eaab341c12b67837cc6dd4562342cdaf118f83d5d554cb37226/)
  assert.match(binding,/Qwen\/Qwen3-30B-A3B-Thinking-2507/)
  assert.match(binding,/144afc2f379b542fdd4e85a1fcd5e1f79112d95d/)
})

test('Working COS dispatcher has hard provider-cost ceilings and no implicit 30B training GPU',()=>{
  const dispatch=source('lib/ai/cos/cosWorkingDistillationDispatch.ts')
  const env=source('.env.example')

  assert.match(dispatch,/HARD_MAX_HOURLY_COST_USD = 1/)
  assert.match(dispatch,/HARD_MAX_PREPARATION_COST_USD = 0\.25/)
  assert.match(dispatch,/HARD_MAX_TRAINING_COST_USD = 2\.5/)
  assert.match(dispatch,/working_cos_training_flavor_not_configured/)
  assert.match(dispatch,/COS_WORKING_DISTILLATION_HF_TRAINING_FLAVOR/)
  assert.doesNotMatch(env,/COS_WORKING_DISTILLATION_HF_TRAINING_FLAVOR=t4-small/)
  assert.match(dispatch,/resolveHuggingFaceHardwareRate/)
  assert.match(dispatch,/working_cos_training_hourly_cost_cap_exceeded/)
})

test('Working COS preparation binds deterministic manifests before provider execution',()=>{
  const dispatch=source('lib/ai/cos/cosWorkingDistillationDispatch.ts')
  const dataset=source('lib/ai/cos/cosWorkingDistillationDataset.ts')
  const jobs=source('lib/ai/cos/cosUniversityHuggingFaceJobs.ts')
  const worker=source('scripts/cos-university-hf-worker-base.py')

  assert.match(dispatch,/readWorkingCosDatasetMaterialization/)
  assert.match(dispatch,/expectedTrainingManifestHash/)
  assert.match(dispatch,/expectedHoldoutManifestHash/)
  assert.match(dispatch,/workingCosRows: context\.materialization\.rows/)
  assert.match(dataset,/COS_WORKING_DISPATCH_SUBJECTS = 8/)
  assert.match(dataset,/COS_WORKING_DISPATCH_MAX_ITEMS = 224/)
  assert.match(dispatch,/registered\.registered === false/)
  assert.match(dispatch,/COS_WORKING_DISPATCH_MAX_ITEMS/)
  assert.match(jobs,/embeddedWorkingCosRowsValid/)
  assert.match(worker,/worker_working_cos_training_manifest_mismatch/)
  assert.match(worker,/worker_working_cos_holdout_manifest_mismatch/)
})

test('Working COS worker pins the exact base revision instead of training latest',()=>{
  const base=source('scripts/cos-university-hf-worker-base.py')
  const overlay=source('scripts/cos-university-hf-worker.py')

  assert.match(base,/base_model_revision = clean\(envelope\.get\("baseModelRevision"\)/)
  assert.match(base,/revision=base_model_revision or None/)
  assert.match(base,/"baseModelRevision": base_model_revision/)
  assert.match(overlay,/base_model_revision = base\.clean\(revision\.get\("baseModelRevision"\)/)
  assert.match(overlay,/revision=base_model_revision or None/)
  assert.match(overlay,/"baseModelRevision": base_model_revision/)
})

test('Working COS trained adapter enters evaluation, never automatic Production activation',()=>{
  const dispatch=source('lib/ai/cos/cosWorkingDistillationDispatch.ts')
  const callback=source('app/api/internal/cos/university-training-executor/evidence/route.ts')
  const artifacts=source('lib/ai/cos/cosLocalDistillationArtifacts.ts')
  const migration=source('supabase/migrations/20260924003000_cos_working_distillation_job_events.sql')

  assert.match(dispatch,/working_cos_supervised_distillation/)
  assert.match(dispatch,/recordFineTuneHostApproval/)
  assert.match(dispatch,/decideControlledFineTune/)
  assert.match(dispatch,/automaticActivationAuthorized: false/)
  assert.match(dispatch,/productionTrafficAuthorized: false/)
  assert.match(dispatch,/universityGraduationClaimed: false/)
  assert.match(callback,/recordWorkingCosTrainingExecutorEvidence/)
  assert.match(artifacts,/working_cos_supervised_distillation/)
  assert.match(artifacts,/runpod_primary_exact_baseline_adapter/)
  assert.match(migration,/production_traffic_authorized boolean not null default false check \(production_traffic_authorized is false\)/)
  assert.match(migration,/university_graduation_claimed boolean not null default false check \(university_graduation_claimed is false\)/)
})

test('Working COS rollback evidence preserves both training-base rollback and live Production baseline',()=>{
  const dispatch=source('lib/ai/cos/cosWorkingDistillationDispatch.ts')
  assert.match(dispatch,/readRegisteredRuntimeRollback/)
  assert.match(dispatch,/trainingRollbackArtifactRef/)
  assert.match(dispatch,/workingCosBaselineIdentity/)
  assert.match(dispatch,/working_cos_callback_training_rollback_binding_invalid/)
  assert.match(dispatch,/rollbackArtifactRef = runtimeRollback\.rollbackArtifactRef/)
})
