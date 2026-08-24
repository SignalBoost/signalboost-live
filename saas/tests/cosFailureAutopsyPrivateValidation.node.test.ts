import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  FAILURE_AUTOPSY_PRIVATE_HOLDOUT_MIN_ATTEMPTS,
  FAILURE_AUTOPSY_PRIVATE_HOLDOUT_MIN_RATE,
  selectUnusedPrivateHoldoutCase,
  summarizePrivateHoldoutEvidence,
} from '../lib/ai/cos/failureAutopsyPrivateValidationPolicy.ts'

const file = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const cases = [
  { id: 'private-a', problemClass: 'incident diagnosis' },
  { id: 'private-b', problemClass: 'incident diagnosis' },
  { id: 'private-c', problemClass: 'incident diagnosis' },
  { id: 'private-d', problemClass: 'database performance' },
]

test('private validation selects only an unused private case from the exact problem class', () => {
  const selected = selectUnusedPrivateHoldoutCase({
    cases,
    problemClass: 'incident diagnosis',
    priorCaseIds: ['private-a'],
  })
  assert.equal(selected?.id, 'private-b')
})

test('three separate private passes satisfy the independent validation floor', () => {
  assert.equal(FAILURE_AUTOPSY_PRIVATE_HOLDOUT_MIN_ATTEMPTS, 3)
  assert.equal(FAILURE_AUTOPSY_PRIVATE_HOLDOUT_MIN_RATE, 0.8)
  const summary = summarizePrivateHoldoutEvidence([
    { caseId: 'a', success: true, observedAt: '2026-08-24T10:00:00Z' },
    { caseId: 'b', success: true, observedAt: '2026-08-24T10:01:00Z' },
    { caseId: 'c', success: true, observedAt: '2026-08-24T10:02:00Z' },
  ])
  assert.equal(summary.eligible, true)
  assert.equal(summary.distinctCases, 3)
  assert.equal(summary.successRate, 1)
})

test('stale pre-weakening passes cannot clear weakened state', () => {
  const summary = summarizePrivateHoldoutEvidence([
    { caseId: 'a', success: true, observedAt: '2026-08-24T09:00:00Z' },
    { caseId: 'b', success: true, observedAt: '2026-08-24T09:01:00Z' },
    { caseId: 'c', success: true, observedAt: '2026-08-24T09:02:00Z' },
  ], '2026-08-24T10:00:00Z')
  assert.equal(summary.attempts, 0)
  assert.equal(summary.eligible, false)
})

test('fresh revalidation after weakening needs new separately recorded private outcomes', () => {
  const summary = summarizePrivateHoldoutEvidence([
    { caseId: 'old', success: true, observedAt: '2026-08-24T09:00:00Z' },
    { caseId: 'd', success: true, observedAt: '2026-08-24T10:01:00Z' },
    { caseId: 'e', success: true, observedAt: '2026-08-24T10:02:00Z' },
    { caseId: 'f', success: true, observedAt: '2026-08-24T10:03:00Z' },
  ], '2026-08-24T10:00:00Z')
  assert.equal(summary.attempts, 3)
  assert.equal(summary.eligible, true)
})

test('runtime validation uses private acceptance cases, never controlled utilization fixtures as holdouts', () => {
  const source = file('../lib/ai/cos/failureAutopsyPrivateValidation.ts')
  assert.match(source, /cos_capability_benchmark_cases/)
  assert.match(source, /isPrivateCapabilityAcceptanceOrigin/)
  assert.match(source, /source_kind: 'failure_autopsy_private_holdout'/)
  assert.match(source, /experience_kind: 'holdout'/)
  assert.match(source, /attachOutcome: false/)
  assert.match(source, /fresh\.eligible/)
  assert.match(source, /patch\.weakened_at = null/)
  assert.doesNotMatch(source, /COS_EVIDENCE_UTILIZATION_BENCHMARK/)
})
