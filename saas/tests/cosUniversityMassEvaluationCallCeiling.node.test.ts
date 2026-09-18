// saas/tests/cosUniversityMassEvaluationCallCeiling.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MASS_EVALUATION_ENDPOINT_CALLS,
  MASS_EVALUATION_JUDGE_CALLS,
} from '../lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts'

const evaluator = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const authority = readFileSync(new URL('../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts', import.meta.url), 'utf8')
const cron = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')

// Owner decision 2026-09-17: ceiling raised 8 -> 14 so the trained candidate, measured at ~1.7x the baseline's wall
// time on identical cases (28.4s vs 16.9s against a 35.2-40.4s gateway cutoff), can use smaller requests while
// preserving every holdout case, the fixed suites, and bounded recovery headroom.

test('the ceiling is 14 and is defined exactly once', () => {
  assert.equal(MASS_EVALUATION_ENDPOINT_CALLS, 14)
  assert.equal(MASS_EVALUATION_JUDGE_CALLS, 4)
})

test('all three enforcement points read the shared constant, so the approval shape cannot drift', () => {
  assert.match(evaluator, /const ENDPOINT_CALLS = MASS_EVALUATION_ENDPOINT_CALLS/)
  assert.match(authority, /maxEndpointCalls: MASS_EVALUATION_ENDPOINT_CALLS/)
  assert.match(cron, /maxEndpointCalls !== MASS_EVALUATION_ENDPOINT_CALLS/)
  for (const source of [evaluator, authority, cron]) {
    assert.doesNotMatch(source, /maxEndpointCalls\s*(!==|===)\s*8\b/)
    assert.doesNotMatch(source, /maxEndpointCalls:\s*8\b/)
  }
})

test('the slower candidate uses the largest budget-derived grouping that leaves fixed-suite and recovery capacity', () => {
  assert.match(evaluator, /const fixedEndpointCalls=2;const recoveryReserve=1/)
  assert.match(evaluator, /const baselineGroupCount=planMassEvaluationGroups\(holdoutCases,batchPrompt,2\)\.length/)
  assert.match(evaluator, /const candidateGroupTarget=Math\.min\(holdoutCases\.length,ENDPOINT_CALLS-baselineGroupCount-fixedEndpointCalls-recoveryReserve\)/)
  assert.match(evaluator, /maxGroups:candidateGroupTarget,minGroups:candidateGroupTarget,reserveCallsAfter:fixedEndpointCalls/)
})

test('a 13-case holdout fits exactly with a dedicated retry reserve', () => {
  const holdoutCases = 13
  const baselineGroups = 1
  const fixedEndpointCalls = 2
  const recoveryReserve = 1
  const candidateGroups = Math.min(holdoutCases, MASS_EVALUATION_ENDPOINT_CALLS - baselineGroups - fixedEndpointCalls - recoveryReserve)
  assert.equal(candidateGroups, 10)
  assert.equal(baselineGroups + candidateGroups + fixedEndpointCalls + recoveryReserve, MASS_EVALUATION_ENDPOINT_CALLS)
})

test('raising the CALL ceiling leaves every SPEND and promotion gate untouched', () => {
  assert.match(evaluator, /input\.claim\.maxEstimatedRuntimeWakeCostUsd>0\.2/)
  assert.match(evaluator, /input\.claim\.maxRuntimeWakeAttempts!==1/)
  assert.match(evaluator, /holdout\.candidateScore>holdout\.baselineScore/)
  assert.match(evaluator, /productionTrafficAuthorized:false/)
})

test('the claim validator still rejects an approval that does not match the run it authorizes', () => {
  assert.match(evaluator, /if\(input\.claim\.maxEndpointCalls!==ENDPOINT_CALLS\|\|input\.claim\.maxJudgeCalls!==JUDGE_CALLS/)
  assert.match(evaluator, /throw new Error\('mass_distilled_evaluation_claim_ceiling_invalid'\)/)
})
