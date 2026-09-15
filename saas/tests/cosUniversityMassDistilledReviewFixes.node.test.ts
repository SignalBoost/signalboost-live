import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('canary consumption is fenced by exact owner attempts and exact owner dollars', () => {
  const route = source('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts')
  assert.match(route, /approvedInvocations = Math\.floor\(Number\(evidence\?\.maxCanaryInvocations/)
  assert.match(route, /consumed >= approval\.approvedInvocations/)
  assert.match(route, /approvedCostUsd = Number\(evidence\?\.maxEstimatedCanaryCostUsd/)
  assert.match(route, /estimatedCanaryCostUsd > approval\.approvedCostUsd \+ 1e-9/)
  assert.match(route, /mass_distilled_canary_approved_budget_too_small/)
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
})

test('mass evaluator reserves a phase before exact runtime readiness and scoring', () => {
  const evaluator = source('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
  const initialClaim = evaluator.indexOf("claimMassDistilledEvaluationPhase({ candidateId, artifactHash, phase: 'initial' })")
  const initialReady = evaluator.lastIndexOf('waitForMassDistilledReady(canary.endpointId)')
  const holdout = evaluator.indexOf("runSuite({ suiteName: 'holdout'")
  assert.ok(initialClaim >= 0 && initialReady > initialClaim && holdout > initialReady)
  const retentionClaim = evaluator.indexOf("claimMassDistilledEvaluationPhase({ candidateId, artifactHash, phase: 'retention' })")
  const retentionReady = evaluator.indexOf('waitForMassDistilledReady(canary.endpointId)', retentionClaim)
  const retentionSuite = evaluator.indexOf("runSuite({ suiteName: 'retention'", retentionReady)
  assert.ok(retentionClaim >= 0 && retentionReady > retentionClaim && retentionSuite > retentionReady)
})

test('one failed retention attempt consumes the deferred marker so it cannot auto-spend again', () => {
  const selector = source('../lib/ai/cos/cosUniversityMassDistilledEvaluationSelection.ts')
  const evaluator = source('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
  assert.match(selector, /retentionDeferred = prior\?\.response_hashes\?\.retention\?\.deferred === true/)
  assert.match(evaluator, /retention: \{ \.\.\.retention\.responseHashes, attempted: true \}/)
})

test('mass retention waits release the shared evaluator cron to legacy study-plan work', () => {
  const route = source('../app/api/cron/cos-university-distilled-evaluation/route.ts')
  assert.match(route, /mass_evaluation_work_not_due/)
  assert.match(route, /massLaneIdle/)
  assert.match(route, /const result = massIdle \? await runUniversityDistilledArtifactEvaluation/)
})

test('mass selectors page beyond historical terminal artifacts', () => {
  const selection = source('../lib/ai/cos/cosUniversityMassDistilledEvaluationSelection.ts')
  const canary = source('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts')
  assert.match(selection, /\.range\(offset, offset \+ PAGE_SIZE - 1\)/)
  assert.match(canary, /\.range\(offset, offset \+ PAGE_SIZE - 1\)/)
  assert.doesNotMatch(selection, /\.limit\(20\)/)
  assert.doesNotMatch(canary, /\.limit\(20\)/)
})
