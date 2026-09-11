import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COS_UNIVERSITY_FEATURE_GATED_PATHS, verifyLearningPathReceipts,
  type LearningPathId, type ProductionPathReceipt,
} from '../lib/ai/cos/cosUniversityLearningAssurance.ts'
import { evaluateCosUniversityProductionVerification, type ProductionPathEventRow } from '../lib/ai/cos/cosUniversityProductionVerificationCore.ts'

const now = new Date('2026-09-11T21:00:00Z')
const commitSha = 'a'.repeat(40)
const deploymentId = 'dpl_test_only'
const academicPaths: LearningPathId[] = ['independent_exams', 'subject_a_range_evidence', 'language_a_range_evidence', 'delayed_retention']
function execution(path: LearningPathId, passed = true): Record<string, unknown> {
  return {
    enabled: true, runnerInvoked: true, attempted: 1,
    ...(path === 'delayed_retention' ? { status: passed ? 'passed' : 'failed', passed }
      : { runs: [{ runId: 'test-run', status: passed ? 'passed' : 'failed', passed }] }),
  }
}
function receipt(path: LearningPathId, proof: unknown = execution(path)): ProductionPathReceipt {
  return {
    path, deploymentId, commitSha, observedAt: '2026-09-11T20:00:00Z', expiresAt: '2026-09-12T20:00:00Z',
    featureEnabled: true, invocationSucceeded: true, verifier: 'host_production_verifier',
    durableEvidenceRef: 'db://test-only/receipt', executionEvidence: proof,
  } as ProductionPathReceipt
}
function verify(path: LearningPathId, proof: unknown) {
  return verifyLearningPathReceipts({ expectedCommitSha: commitSha, now, requiredPaths: [path], receipts: [receipt(path, proof)] })
}
function event(path: LearningPathId, proof: unknown): ProductionPathEventRow {
  return {
    event_key: 'test-only-event', path_id: path, deployment_id: deploymentId, commit_sha: commitSha,
    observed_at: '2026-09-11T20:00:00Z', expires_at: '2026-09-12T20:00:00Z', verifier: 'host_production_verifier',
    evidence: { featureEnabled: true, invocationSucceeded: true, ...proof as Record<string, unknown> },
  }
}

test('successful scheduler no-ops never verify a learning path', () => {
  for (const path of Object.keys(COS_UNIVERSITY_FEATURE_GATED_PATHS) as LearningPathId[]) {
    for (const patch of [{ dailyCadence: 'not_due' }, { runnerInvoked: false }, { skipped: true }]) {
      assert.equal(verify(path, { ...execution(path), ...patch }).verified, false, `${path}: ${JSON.stringify(patch)}`)
    }
  }
})

test('missing, malformed or metadata-only execution payload fails closed', () => {
  for (const proof of [undefined, null, [], 'executed', {}, { featureEnabled: true, invocationSucceeded: true },
    { ...execution('independent_exams'), runnerInvoked: 'true' },
    { ...execution('independent_exams'), enabled: 'true' },
    { ...execution('independent_exams'), errors: 'none' }]) {
    // Undefined is intentional here, not the fixture factory default.
    const r = { ...receipt('independent_exams'), executionEvidence: proof }
    assert.equal(verifyLearningPathReceipts({ expectedCommitSha: commitSha, now, requiredPaths: ['independent_exams'], receipts: [r] }).verified, false)
  }
})

test('specialist policy blocks and disabled or failed invocations cannot become execution proof', () => {
  for (const path of academicPaths) {
    for (const patch of [{ blocked: 'agent_academic_executor_unavailable' }, { status: 'blocked' },
      { enabled: false }, { errors: ['database_unavailable'] }, { error: 'database_unavailable' }]) {
      assert.equal(verify(path, { ...execution(path), ...patch }).verified, false)
    }
  }
})

test('zero-attempt, cached and unclaimed academic results cannot prove fresh examination', () => {
  for (const path of academicPaths) {
    for (const attempted of [0, -1, 0.5, '1', NaN]) assert.equal(verify(path, { ...execution(path), attempted }).verified, false)
  }
  for (const path of academicPaths.filter(path => path !== 'delayed_retention')) {
    for (const status of ['already_complete', 'already_passed', 'not_claimed', 'error']) {
      assert.equal(verify(path, { ...execution(path), runs: [{ runId: 'test-run', status, passed: true }] }).verified, false)
    }
    assert.equal(verify(path, { ...execution(path), runs: [] }).verified, false)
    assert.equal(verify(path, { ...execution(path), attempted: 2 }).verified, false)
    assert.equal(verify(path, { ...execution(path), runs: [{ runId: '', status: 'passed', passed: true }] }).verified, false)
  }
})

test('fresh independently scored failures prove execution without becoming passes or credit', () => {
  for (const path of academicPaths) {
    const proof = execution(path, false)
    const before = JSON.stringify(proof)
    assert.equal(verify(path, proof).verified, true)
    assert.equal(JSON.stringify(proof), before)
    assert.equal('credential' in proof, false)
  }
})

test('contradictory scored outcomes and duplicate run identities fail closed', () => {
  assert.equal(verify('delayed_retention', { ...execution('delayed_retention'), passed: false }).verified, false)
  assert.equal(verify('independent_exams', { ...execution('independent_exams'), runs: [{ runId: 'test-run', status: 'failed', passed: true }] }).verified, false)
  const run = { runId: 'test-run', status: 'passed', passed: true }
  assert.equal(verify('independent_exams', { enabled: true, attempted: 2, runs: [run, run] }).verified, false)
})

test('a real blocked graduation evaluation stays distinct from an unexecuted academic exam', () => {
  const proof = { enabled: true, assessmentRowsRead: 3, status: { graduated: false, awardEligible: false },
    capstoneRun: { runId: null, state: 'not_eligible', passed: null, reasons: ['minimum_residence_incomplete'] }, errors: [] }
  assert.equal(verify('graduation', proof).verified, true)
  assert.equal(proof.status.graduated, false)
  assert.equal(proof.capstoneRun.runId, null)
})

test('the live mapper preserves no-op and policy-block evidence rather than stripping it', () => {
  for (const proof of [{ dailyCadence: 'not_due', runnerInvoked: false }, { ...execution('independent_exams'), blocked: 'agent_academic_executor_unavailable' }]) {
    const result = evaluateCosUniversityProductionVerification({ deploymentId, commitSha, now, rows: [event('independent_exams', proof)] })
    const path = result.paths.find(row => row.path === 'independent_exams')!
    assert.equal(path.receiptFound, true)
    assert.equal(path.invocationSucceeded, true)
    assert.equal(path.verified, false)
    assert.ok(result.missingOrInvalid.includes('independent_exams'))
  }
})

test('per-path and aggregate verification both reject future observations', () => {
  const row = { ...event('independent_exams', execution('independent_exams')), observed_at: '2026-09-11T22:00:00Z' }
  const result = evaluateCosUniversityProductionVerification({ deploymentId, commitSha, now, rows: [row] })
  assert.equal(result.paths.find(path => path.path === 'independent_exams')?.verified, false)
  assert.ok(result.missingOrInvalid.includes('independent_exams'))
})

test('exact deployment, commit, expiry and host-verifier boundaries remain required', () => {
  for (const patch of [{ deployment_id: 'other-deployment' }, { commit_sha: 'b'.repeat(40) },
    { expires_at: now.toISOString() }, { verifier: 'learner' }]) {
    const row = { ...event('independent_exams', execution('independent_exams')), ...patch }
    const result = evaluateCosUniversityProductionVerification({ deploymentId, commitSha, now, rows: [row] })
    assert.equal(result.paths.find(path => path.path === 'independent_exams')?.verified, false)
  }
})
