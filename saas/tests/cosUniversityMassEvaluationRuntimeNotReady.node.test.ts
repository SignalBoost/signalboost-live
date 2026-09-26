// saas/tests/cosUniversityMassEvaluationRuntimeNotReady.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT,
  MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  decideRollingMassEvaluationApproval,
  type RollingEvent,
} from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const now = new Date('2026-09-17T06:00:00Z')
const hash = '7f23dde5'.padEnd(64, 'a')
const artifact = { candidateId: 'mass:cs:1', subjectId: 'Computer Science & Coding', artifactHash: hash, createdAt: '2026-09-15T22:34:00Z' }
const ev = (verifier: string, evidence: Record<string, unknown>, observedAt: string, expiresAt: string | null = null): RollingEvent => ({ candidateId: artifact.candidateId, verifier, evidence, observedAt, expiresAt })
const canary = ev('host_production_verifier', { claim: 'production_canary_healthy', artifactHash: hash, exactArtifact: true, productionTrafficAuthorized: false }, '2026-09-16T10:00:00Z')
const rolling = ev('host_controller', { claim: 'distilled_independent_evaluation_approved', artifactHash: hash, authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF }, '2026-09-17T00:20:00Z', '2026-09-17T02:20:00Z')
const failures = (error: string) => Array.from({ length: MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT }, (_, i) =>
  ev('host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: hash, error }, `2026-09-17T0${i + 1}:00:00Z`))
const started = ev('host_controller', { claim: 'mass_distilled_independent_evaluation_started', artifactHash: hash }, '2026-09-17T00:21:00Z')

test('evaluator retriggers non-token ping even while RunPod worker counters are zero', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
  const start = source.indexOf('async function waitReady(endpointId:string,deadlineMs:number)')
  const end = source.indexOf('\nfunction batchPrompt', start)
  assert.ok(start >= 0 && end > start)
  const readiness = source.slice(start, end)
  assert.match(readiness, /massDistilledRuntimeHealth\(endpointId\)/)
  assert.match(readiness, /runpodServerlessRootUrl\(endpointId\)\}\/ping/)
  assert.match(readiness, /if\(response\.ok\)\{[\s\S]*?return/)
  assert.doesNotMatch(readiness, /payload\?\.modelReady===true/)
  assert.doesNotMatch(readiness, /gatewayStatus==='ready'\|\|gatewayStatus==='accepting_requests'/)
  assert.doesNotMatch(readiness, /health\.workers\.ready>0\|\|health\.workers\.running>0/)
  assert.doesNotMatch(readiness, /\/ready/)
  assert.doesNotMatch(readiness, /\/v1\/chat\/completions/)
})

test('runtime and RunPod transport failures do not exhaust the artifact retry budget', () => {
  for (const error of [
    'mass_distilled_evaluation_runtime_not_ready:network',
    'mass_distilled_evaluation_runtime_not_ready:503',
    'mass_distilled_evaluation_runpod_timeout:candidate:cases=4',
  ]) {
    const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifact], events: [canary, rolling, started, ...failures(error)], now })
    assert.equal(decision.issue, true, error)
    if (decision.issue) assert.equal(decision.evidence.priorFailedAttempts, 0)
  }
})

test('bootstrap failures still count, because a bad artifact can cause them', () => {
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifact], events: [canary, rolling, started, ...failures('mass_distilled_evaluation_runtime_bootstrap_failed')], now })
  assert.equal(decision.issue, false)
})


test('evaluation wake explicitly allocates only one worker and scales back down', () => {
  const provision = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  const activate = provision.slice(
    provision.indexOf('export async function activateMassDistilledEvaluationWorker'),
    provision.indexOf('/** Return an explicitly woken evaluator endpoint', provision.indexOf('export async function activateMassDistilledEvaluationWorker')),
  )
  const deactivate = provision.slice(
    provision.indexOf('export async function deactivateMassDistilledEvaluationWorker'),
    provision.indexOf('\nfunction materializedEndpointMatches', provision.indexOf('export async function deactivateMassDistilledEvaluationWorker')),
  )
  assert.match(activate, /workers: \{ min: 1, max: 1, idleTimeout: IDLE_TIMEOUT_SECONDS \}/)
  assert.match(activate, /APPROVED_POOLS/)
  assert.match(activate, /authorityExpanded: false/)
  assert.match(deactivate, /workers: \{ min: 0, max: 0, idleTimeout: IDLE_TIMEOUT_SECONDS \}/)
  assert.match(deactivate, /mass_distilled_evaluation_worker_retirement_rejected/)
  assert.match(deactivate, /assertNonGpuEndpointSafetyPolicy\(deactivated, IDLE_TIMEOUT_SECONDS\)/)
  assert.match(route, /await activateMassDistilledEvaluationWorker\(claim\.endpointId\)/)
  assert.match(route, /await deactivateMassDistilledEvaluationWorker\(claim\.endpointId\)/)
  assert.doesNotMatch(route, /const runtimeWake = await wakeMassDistilledRuntime\(claim\.endpointId, deadlineMs\)/)
})


test('pre-repair HTTP-200 ping contract failure is released without weakening other readiness failures', () => {
  const authority = readFileSync(new URL('../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts', import.meta.url), 'utf8')
  assert.match(authority, /MASS_EVALUATION_PING_200_REPAIR_AT/)
  assert.match(authority, /error === 'mass_distilled_evaluation_runtime_not_ready:200'/)
  assert.match(authority, /observedAt < MASS_EVALUATION_PING_200_REPAIR_AT_MS/)
})
