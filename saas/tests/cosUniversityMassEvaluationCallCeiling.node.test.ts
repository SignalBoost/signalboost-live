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
const worker = readFileSync(new URL('../scripts/cos-university-hf-worker-base.py', import.meta.url), 'utf8')
const cron = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')

// Owner decision 2026-09-17: ceiling raised 8 -> 14 so the trained candidate, measured at ~1.7x the baseline's wall
// time on identical cases (28.4s vs 16.9s against a 35.2-40.4s gateway cutoff), can use smaller requests while
// preserving every holdout case, the fixed suites, and bounded recovery headroom.

test('the ceiling is 35 and is defined exactly once', () => {
  // 14 -> 18: the four extra calls paid for one request per fixed suite per model.
  // 18 -> 25: the seven extra calls buy the BASELINE the same nine holdout requests the candidate already had,
  // so both models answer with the same output-token room on the comparison holdout_improved grades.
  // 25 -> 35 (owner 2026-10-07): the holdout grows 6 -> 12 cases and stays one case per request for both models.
  assert.equal(MASS_EVALUATION_ENDPOINT_CALLS, 35)
  assert.match(worker, /^MASS_HOLDOUT_MAX_ITEMS = 12$/m)
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

test('both models get the same budget-derived grouping, leaving fixed-suite and recovery capacity', () => {
  assert.match(evaluator, /const fixedEndpointCalls=6;const recoveryReserve=5/)
  // The holdout budget is split evenly so the baseline is no longer pinned at 2 groups while the candidate takes
  // the remainder. Unequal requests meant unequal output-token room per answer on the exact comparison
  // holdout_improved grades (Production 2026-09-28: candidate 9 requests, baseline 2, on a 13-case holdout).
  assert.match(evaluator, /const holdoutGroupTarget=Math\.min\(holdoutCases\.length,Math\.floor\(\(ENDPOINT_CALLS-fixedEndpointCalls-recoveryReserve\)\/2\)\)/)
  assert.match(evaluator, /const baselineGroupCount=holdoutGroupTarget/)
  assert.match(evaluator, /const candidateGroupTarget=holdoutGroupTarget/)
  assert.match(evaluator, /maxGroups:candidateGroupTarget,minGroups:candidateGroupTarget,reserveCallsAfter:fixedEndpointCalls/)
  assert.match(evaluator, /minGroups:baselineGroupCount,feature:'mass_distilled_eval_holdout_baseline'/)
})

test('a 12-case holdout is one case per request for both models, with fixed suites and recovery reserved', () => {
  const holdoutCases = 12
  // Six: one request per fixed suite per model. Five: the evaluator's recovery reserve.
  const fixedEndpointCalls = 6
  const recoveryReserve = 5
  const groupsPerModel = Math.min(holdoutCases, Math.floor((MASS_EVALUATION_ENDPOINT_CALLS - fixedEndpointCalls - recoveryReserve) / 2))
  assert.equal(groupsPerModel, 12)
  assert.equal(groupsPerModel * 2 + fixedEndpointCalls + recoveryReserve, MASS_EVALUATION_ENDPOINT_CALLS)
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
