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
const claimMigration = readFileSync(new URL('../supabase/migrations/20260918005000_mass_distilled_evaluation_claim_14_calls.sql', import.meta.url), 'utf8')

// Owner decision 2026-09-17: ceiling raised 8 -> 14 so the trained candidate, measured at ~1.7x the baseline's wall
// time on identical cases (28.4s vs 16.9s against a 35.2-40.4s gateway cutoff), can be asked one case per request.

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

test('the slower candidate gets one request per holdout case; the baseline keeps its grouping', () => {
  assert.match(evaluator, /cases:holdoutCases,maxGroups:holdoutCases\.length,reserveCallsAfter:2,feature:'mass_distilled_eval_holdout_candidate'/)
  assert.match(evaluator, /cases:holdoutCases,maxGroups:2,reserveCallsAfter:holdoutCases\.length\+2,feature:'mass_distilled_eval_holdout_baseline'/)
})

test('a 7-case holdout fits inside the raised ceiling with retry reserve left over', () => {
  const holdoutCases = 7
  const baselineGroups = 2
  const candidateGroups = holdoutCases
  const fixedGroups = 1
  const spent = baselineGroups + candidateGroups + (fixedGroups * 2)
  assert.equal(spent, 11)
  assert.ok(spent < MASS_EVALUATION_ENDPOINT_CALLS, 'the run must leave calls for the bounded retry path')
  assert.equal(MASS_EVALUATION_ENDPOINT_CALLS - spent, 3)
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


test('the database claim gate accepts the same 14-call authority and rejects the stale 8-call contract', () => {
  assert.match(claimMigration, /if v_max_endpoint<>14 or v_max_judge<>4 or v_max_wake<>1/)
  assert.doesNotMatch(claimMigration, /v_max_endpoint<>8\b/)
})
