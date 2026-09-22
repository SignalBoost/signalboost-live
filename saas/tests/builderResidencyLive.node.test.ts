import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  BUILDER_RESIDENCY_TEACHING_CASE_IDS,
  materializeBuilderResidencyTeachingCase,
} from '../platform-harness/cases/builder-residency-teaching.ts'

const source = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')

const migration = source('../supabase/migrations/20260922225500_cos_university_builder_residency_live.sql')
const runtime = source('../lib/ai/cos/cosUniversityResidencyRuntime.ts')
const runner = source('../platform-harness/cases/builder-residency-live.ts')
const enrollmentRoute = source('../app/api/cron/cos-university-residency/route.ts')
const runRoute = source('../app/api/cron/cos-university-residency-run/route.ts')
const assurance = source('../lib/ai/cos/cosUniversityLearningAssurance.ts')

test('Builder Residency teaching variants are candidate-specific and never final-exam material', () => {
  for (const caseId of BUILDER_RESIDENCY_TEACHING_CASE_IDS) {
    const first = materializeBuilderResidencyTeachingCase(caseId, 'mass:candidate:a')
    const second = materializeBuilderResidencyTeachingCase(caseId, 'mass:candidate:b')
    assert.match(first.variantHash, /^[a-f0-9]{64}$/)
    assert.match(second.variantHash, /^[a-f0-9]{64}$/)
    assert.notEqual(first.variantHash, second.variantHash)
    assert.equal(first.finalExamMaterialUsed, false)
    assert.ok(first.expectedStdout.length > 0)
  }
})

test('Residency ledger binds evidence key separately from immutable Hub artifact revision', () => {
  assert.match(migration, /artifact_revision text not null check \(artifact_revision ~ '\^\[0-9a-f\]\{40\}\$'\)/)
  assert.match(migration, /revision_key text not null check \(revision_key ~ '\^\[0-9a-f\]\{64\}\$'\)/)
  assert.match(migration, /cos_claim_next_builder_residency_case/)
  assert.match(migration, /for update skip locked/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /residency_stale_claim_retry_exhausted/)
})

test('Residency runtime is exact-artifact educational serving, never final canary', () => {
  assert.match(runtime, /provisionMassDistilledRuntime/)
  assert.match(runtime, /proveGraduateServedIdentity/)
  assert.match(runtime, /supervised_practical_residency_runtime_not_final_canary/)
  assert.match(runtime, /one scale-to-zero endpoint per exact student artifact/)
  assert.doesNotMatch(runtime, /canaryMassDistilledRuntime/)
  assert.doesNotMatch(runtime, /submitClaim/)
})

test('live Builder Residency tools execute only through Platform Harness and Governed Socket', () => {
  assert.match(runner, /runHarnessWorker/)
  assert.match(runner, /createGovernedHarnessExecutor/)
  assert.match(runner, /native\.builder\.workspace\.write/)
  assert.match(runner, /native\.builder\.sandbox\.run/)
  assert.match(runner, /environmentClass !== 'sandbox'/)
  assert.match(runner, /discard ephemeral residency workspace/)
  assert.match(runner, /destroy ephemeral Vercel sandbox/)
  assert.doesNotMatch(runner, /createBuilderCodingAiPort/)
  assert.doesNotMatch(runner, /pull_request\.merge/)
  assert.doesNotMatch(runner, /sql\.execute/)
})

test('enrollment extracts real 40-character Hub revision instead of misusing revision_key', () => {
  assert.match(enrollmentRoute, /hf:\\\/\\\/models/)
  assert.match(enrollmentRoute, /\(\[a-f0-9\]\{40\}\)/)
  assert.match(enrollmentRoute, /artifact_revision: artifactRevision/)
  assert.match(enrollmentRoute, /status: 'queued'/)
  assert.match(enrollmentRoute, /runnerInvoked: false/)
})

test('case runner keeps competency, infrastructure, authority and final-exam semantics separate', () => {
  assert.match(runRoute, /status === 'passed' \|\| status === 'competency_failed'/)
  assert.match(runRoute, /failure_route: 'self_healing'/)
  assert.match(runRoute, /finalExamMaterialUsed: false/)
  assert.match(runRoute, /finalCanaryRecorded: false/)
  assert.match(runRoute, /productionTrafficAuthorized: false/)
  assert.match(runRoute, /decideResidencyEvidence/)
  assert.match(runRoute, /assessBuilderResidency/)
})

test('practical Residency is a feature-gated operational assurance lane with real-case proof', () => {
  assert.match(assurance, /\| 'practical_residency'/)
  assert.match(assurance, /practical_residency: 'COS_UNIVERSITY_RESIDENCY_ENABLED'/)
  assert.match(assurance, /path === 'practical_residency'/)
  assert.match(assurance, /evidence\.caseExecuted === true/)
  assert.match(assurance, /residency_case_execution_missing/)
})
