import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COS_UNIVERSITY_UNDERGRADUATE_ACCEPTANCE_PATHS,
  evaluateCosUniversityUndergraduateAcceptance,
} from '../lib/ai/cos/cosUniversityUndergraduateAcceptance.ts'
import type { ProductionPathEventRow } from '../lib/ai/cos/cosUniversityProductionVerificationCore.ts'

const NOW = new Date('2026-09-13T18:00:00.000Z')
const COMMIT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER_COMMIT = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const DEPLOYMENT = 'dpl_live_undergrad_acceptance'
const OTHER_DEPLOYMENT = 'dpl_other'

function row(overrides: Partial<ProductionPathEventRow> & { path_id: string; evidence?: Record<string, unknown> | null }): ProductionPathEventRow {
  return {
    event_key: overrides.event_key || `evt-${overrides.path_id}`,
    path_id: overrides.path_id,
    deployment_id: overrides.deployment_id ?? DEPLOYMENT,
    commit_sha: overrides.commit_sha ?? COMMIT,
    evidence: overrides.evidence === undefined ? {
      featureEnabled: true,
      invocationSucceeded: true,
      runnerInvoked: true,
      enabled: true,
      skipped: false,
      workerResult: { ok: true },
    } : overrides.evidence,
    verifier: overrides.verifier || 'host_production_verifier',
    observed_at: overrides.observed_at || '2026-09-13T17:00:00.000Z',
    expires_at: overrides.expires_at ?? '2026-09-14T18:00:00.000Z',
  }
}

function academicEvidence(attempted = 1): Record<string, unknown> {
  return {
    featureEnabled: true,
    invocationSucceeded: true,
    runnerInvoked: true,
    enabled: true,
    skipped: false,
    attempted,
    runs: [{
      runId: 'run-exam-1',
      status: 'failed',
      passed: false,
    }],
  }
}

function delayedRetentionEvidence(): Record<string, unknown> {
  return {
    featureEnabled: true,
    invocationSucceeded: true,
    runnerInvoked: true,
    enabled: true,
    skipped: false,
    attempted: 1,
    status: 'failed',
    passed: false,
  }
}

function operationalRows(): ProductionPathEventRow[] {
  return COS_UNIVERSITY_UNDERGRADUATE_ACCEPTANCE_PATHS.map(path => {
    if (path === 'delayed_retention') return row({ path_id: path, evidence: delayedRetentionEvidence() })
    if (path === 'independent_exams' || path === 'subject_a_range_evidence' || path === 'language_a_range_evidence') {
      return row({ path_id: path, evidence: academicEvidence(1) })
    }
    return row({ path_id: path })
  })
}

test('rejects a board that is not bound to Production identity', () => {
  const board = evaluateCosUniversityUndergraduateAcceptance({
    production: false,
    deploymentId: DEPLOYMENT,
    commitSha: COMMIT,
    now: NOW,
    rows: operationalRows(),
  })
  assert.equal(board.accepted, false)
  assert.ok(board.paths.every(path => path.status === 'not_production'))
})

test('classifies missing undergraduate paths without inventing receipts', () => {
  const board = evaluateCosUniversityUndergraduateAcceptance({
    production: true,
    deploymentId: DEPLOYMENT,
    commitSha: COMMIT,
    now: NOW,
    rows: [],
  })
  assert.equal(board.accepted, false)
  assert.equal(board.verifiedCount, 0)
  assert.equal(board.requiredCount, 8)
  assert.deepEqual(board.missingOrInvalid, [...COS_UNIVERSITY_UNDERGRADUATE_ACCEPTANCE_PATHS])
  assert.ok(board.paths.every(path => path.status === 'missing' && path.receiptFound === false))
})

test('ignores graduate and fine-tune receipts when scoring undergraduate acceptance', () => {
  const board = evaluateCosUniversityUndergraduateAcceptance({
    production: true,
    deploymentId: DEPLOYMENT,
    commitSha: COMMIT,
    now: NOW,
    rows: [
      row({ path_id: 'masters_exams', evidence: academicEvidence(1) }),
      row({ path_id: 'controlled_fine_tuning', evidence: { featureEnabled: true, invocationSucceeded: true, runnerInvoked: true, enabled: true, trained: true } }),
    ],
  })
  assert.equal(board.accepted, false)
  assert.equal(board.verifiedCount, 0)
  assert.ok(board.paths.every(path => path.status === 'missing'))
})

test('marks stale commit and wrong deployment instead of verified', () => {
  const board = evaluateCosUniversityUndergraduateAcceptance({
    production: true,
    deploymentId: DEPLOYMENT,
    commitSha: COMMIT,
    now: NOW,
    rows: [
      row({ path_id: 'continuous_learning', commit_sha: OTHER_COMMIT }),
      row({ path_id: 'deliberate_practice', deployment_id: OTHER_DEPLOYMENT }),
    ],
  })
  const continuous = board.paths.find(path => path.path === 'continuous_learning')
  const practice = board.paths.find(path => path.path === 'deliberate_practice')
  assert.equal(continuous?.status, 'missing')
  assert.equal(practice?.status, 'wrong_deployment')
})

test('idle skip receipts never count as undergraduate acceptance', () => {
  const board = evaluateCosUniversityUndergraduateAcceptance({
    production: true,
    deploymentId: DEPLOYMENT,
    commitSha: COMMIT,
    now: NOW,
    rows: [
      row({
        path_id: 'independent_exams',
        evidence: {
          featureEnabled: true,
          invocationSucceeded: true,
          runnerInvoked: false,
          skipped: true,
          dailyCadence: 'not_due',
          attempted: 0,
        },
      }),
    ],
  })
  const exams = board.paths.find(path => path.path === 'independent_exams')
  assert.equal(exams?.status, 'idle_skip')
  assert.equal(exams?.scoredAttemptPresent, false)
  assert.equal(board.accepted, false)
})

test('a genuine failed exam is scored execution, not mastery', () => {
  const board = evaluateCosUniversityUndergraduateAcceptance({
    production: true,
    deploymentId: DEPLOYMENT,
    commitSha: COMMIT,
    now: NOW,
    rows: [
      row({ path_id: 'independent_exams', evidence: academicEvidence(1) }),
    ],
  })
  const exams = board.paths.find(path => path.path === 'independent_exams')
  assert.equal(exams?.scoredAttemptPresent, true)
  assert.notEqual(exams?.status, 'idle_skip')
})

test('accepts only when all eight undergraduate paths verify and a scored academic attempt exists', () => {
  const board = evaluateCosUniversityUndergraduateAcceptance({
    production: true,
    deploymentId: DEPLOYMENT,
    commitSha: COMMIT,
    now: NOW,
    rows: operationalRows(),
  })
  assert.equal(board.requiredCount, 8)
  assert.equal(board.verifiedCount, 8)
  assert.ok(board.scoredAcademicPathCount >= 1)
  assert.equal(board.accepted, true)
  assert.deepEqual(board.missingOrInvalid, [])
  assert.equal(board.semantics, 'undergraduate_exact_production_commit_and_deployment_receipts_required')
})
