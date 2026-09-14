import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  decideLocalDistillationLifecycle,
  LOCAL_DISTILLATION_STRATEGY,
} from '../lib/ai/cos/cosLocalDistillationPolicy.ts'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('local distillation lifecycle owns artifacts before traffic authorization', () => {
  assert.deepEqual(decideLocalDistillationLifecycle('', false), {
    status: 'trained_pending_rollback',
    nextGate: 'rollback_evidence',
    trafficAuthorized: false,
  })
  assert.deepEqual(decideLocalDistillationLifecycle('', true), {
    status: 'evaluation_pending',
    nextGate: 'independent_evaluation',
    trafficAuthorized: false,
  })
  assert.deepEqual(decideLocalDistillationLifecycle('pending_runtime', true), {
    status: 'runtime_pending',
    nextGate: 'runtime_binding_canary',
    trafficAuthorized: false,
  })
  assert.deepEqual(decideLocalDistillationLifecycle('active', true), {
    status: 'active',
    nextGate: 'active',
    trafficAuthorized: true,
  })
})

test('local distillation strategy is Serverless-first and adapter-based', () => {
  assert.equal(LOCAL_DISTILLATION_STRATEGY.owner, 'itmounts')
  assert.equal(LOCAL_DISTILLATION_STRATEGY.canonicalStudentBase, 'Qwen/Qwen3-4B')
  assert.equal(LOCAL_DISTILLATION_STRATEGY.artifactKind, 'lora_adapter')
  assert.equal(LOCAL_DISTILLATION_STRATEGY.servingTopology, 'runpod_serverless_primary_deepinfra_fallback')
  assert.match(LOCAL_DISTILLATION_STRATEGY.capacityStrategy, /serverless_multi_gpu_flex/)
  assert.match(LOCAL_DISTILLATION_STRATEGY.accumulation, /many_scoped_adapters/)
})

test('migration creates a service-only local artifact library and backfills prior distillation', () => {
  const migration = source('../supabase/migrations/20260914031500_cos_local_distillation_artifacts.sql')
  assert.match(migration, /create table if not exists public\.cos_local_distillation_artifacts/)
  assert.match(migration, /trained_pending_rollback/)
  assert.match(migration, /evaluation_pending/)
  assert.match(migration, /runpod_serverless_primary_deepinfra_fallback/)
  assert.match(migration, /alter table public\.cos_local_distillation_artifacts enable row level security/)
  assert.match(migration, /revoke all on table public\.cos_local_distillation_artifacts from public, anon, authenticated/)
  assert.match(migration, /evidence->>'claim' = 'trained_artifact_registered'/)
  assert.match(migration, /evidence->>'trainingMode' = 'distillation'/)
  assert.match(migration, /trafficAuthorized.*false/s)
})

test('signed training callback reconciles local ownership only after evidence admission', () => {
  const route = source('../app/api/internal/cos/university-training-executor/evidence/route.ts')
  const recordIndex = route.indexOf('recordUniversityTrainingExecutorEvidence')
  const reconcileIndex = route.lastIndexOf('reconcileLocalDistillationCandidate')
  assert.ok(recordIndex >= 0)
  assert.ok(reconcileIndex > recordIndex)
  assert.match(route, /body\.claim === 'trained_artifact_registered'/)
  assert.match(route, /body\.claim === 'rollback_artifact_registered'/)
  assert.match(route, /retryable: true/)
})

test('controlled fine-tuning reconciles the local library before candidate processing', () => {
  const runtime = source('../lib/ai/cos/cosUniversityControlledFineTuning.ts')
  const reconcileIndex = runtime.indexOf('reconcileLocalDistillationArtifacts(now, 250)')
  const plansIndex = runtime.indexOf("from('cos_university_study_plans')")
  assert.ok(reconcileIndex >= 0 && reconcileIndex < plansIndex)
  assert.match(runtime, /reconcileLocalDistillationCandidate\(candidateId, now\)/)
  assert.match(runtime, /localDistillationArtifacts/)
  assert.match(runtime, /distilled_artifacts_immediately_enter_itmounts_local_library/)
})
