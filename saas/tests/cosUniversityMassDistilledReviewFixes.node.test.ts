import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('canary consumption is fenced by the owner-approved invocation count, not the global maximum', () => {
  const route = source('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts')
  assert.match(route, /approvedInvocations = Math\.floor\(Number\(evidence\?\.maxCanaryInvocations/)
  assert.match(route, /approvedInvocations <= MAX_CANARY_INVOCATIONS/)
  assert.match(route, /consumed >= approval\.approvedInvocations/)
  assert.match(route, /approvedInvocations: approval\.approvedInvocations/)
})

test('stored scorer claims repair without RunPod, judge, or dataset activity before evaluation starts', () => {
  const repair = source('../lib/ai/cos/cosUniversityMassDistilledClaimReconciliation.ts')
  const route = source('../app/api/cron/cos-university-distilled-evaluation/route.ts')
  assert.match(repair, /providerCalls: 0/)
  assert.match(repair, /judgeCalls: 0/)
  assert.match(repair, /datasetFetches: 0/)
  assert.match(repair, /mass_distilled_claim_repair_original_approval_missing/)
  assert.doesNotMatch(repair, /runpodServerless|waitForMassDistilledReady|datasets-server\.huggingface|callLocalModel/)
  const repairIndex = route.indexOf('reconcileMassDistilledEvaluationClaims(new Date())')
  const evaluationIndex = route.indexOf('runUniversityMassDistilledArtifactEvaluation(new Date())')
  assert.ok(repairIndex >= 0 && evaluationIndex > repairIndex)
  assert.match(route.slice(repairIndex, evaluationIndex), /claimRepairOnly: true/)
})

test('mass evaluator explicitly waits for exact runtime readiness before score-generating suites', () => {
  const evaluator = source('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
  assert.match(evaluator, /waitForMassDistilledReady\(canary\.endpointId\)/)
  const readyIndex = evaluator.indexOf('waitForMassDistilledReady(canary.endpointId)')
  const holdoutIndex = evaluator.indexOf("runSuite({ suiteName: 'holdout'")
  const retentionIndex = evaluator.indexOf("runSuite({ suiteName: 'retention'")
  assert.ok(readyIndex >= 0)
  assert.ok(holdoutIndex > readyIndex)
  assert.ok(retentionIndex > readyIndex)
})

test('one failed retention attempt consumes the deferred marker so it cannot auto-spend again', () => {
  const evaluator = source('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
  assert.match(evaluator, /retentionDeferred = prior\?\.response_hashes\?\.retention\?\.deferred === true/)
  assert.match(evaluator, /retention: \{ \.\.\.retention\.responseHashes, attempted: true \}/)
})

test('mass retention waits release the shared evaluator cron to legacy study-plan work', () => {
  const route = source('../app/api/cron/cos-university-distilled-evaluation/route.ts')
  assert.match(route, /mass_evaluation_work_not_due/)
  assert.match(route, /massLaneIdle/)
  assert.match(route, /const result = massIdle \? await runUniversityDistilledArtifactEvaluation/)
})
