// saas/tests/massEvaluationApprovalSkipReasons.node.test.ts
//
// Production 2026-09-28 04:55..20:39 UTC: 470 consecutive exam ticks ended "no_mass_artifact_eligible_for_rolling_
// evaluation" with ~1,300 artifacts pending and nothing recorded WHICH rule passed each one over. The approval rules
// now count their skip reasons and the exam route writes them into its Production receipt. Observation only.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decideRollingMassEvaluationApproval } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const now = new Date('2026-09-28T20:00:00.000Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
const artifact = (id: string, ageHours: number) => ({
  candidateId: `mass:${id}`, subjectId: 'Business & Operations', artifactHash: id.repeat(64).slice(0, 64),
  createdAt: hoursAgo(ageHours), frontierRecipe: false, builderV2: false, remediationReplay: false,
})

test('an all-skipped tick reports how many artifacts it considered and why each was passed over', () => {
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact('a', 2), artifact('b', 30), artifact('c', 40)],
    events: [],
    now,
    frontierProofCompletions: 99,
    builderV2ProofCompletions: 99,
    remediationReplayProofCompletions: 99,
    inFlightCount: 0,
  })
  assert.equal(decision.issue, false)
  assert.ok(!decision.issue)
  assert.equal(decision.reason, 'no_mass_artifact_eligible_for_rolling_evaluation')
  assert.equal(decision.considered, 3)
  assert.deepEqual({ ...decision.skipped }, { younger_than_12h: 1, no_exact_healthy_canary: 2 })
})

test('every skip point in the approval loop is labelled, and the route records the counts', () => {
  const rules = readFileSync(new URL('../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts', import.meta.url), 'utf8')
  const loop = rules.slice(rules.indexOf('for (const artifact of ordered) {'), rules.indexOf("reason: 'no_mass_artifact_eligible_for_rolling_evaluation'"))
  assert.equal((loop.match(/\bcontinue\b/g) || []).length, (loop.match(/skip\('/g) || []).length)
  assert.equal((loop.match(/skip\('/g) || []).length, 15)
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  assert.match(route, /approvalReason: rolling\.reason,/)
  assert.match(route, /approvalConsidered: rolling\.considered, approvalSkipped: rolling\.skipped/)
})
