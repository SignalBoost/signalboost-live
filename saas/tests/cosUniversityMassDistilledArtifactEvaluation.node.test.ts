import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { massDistilledRuntimeSpec } from '../lib/ai/cos/runpodServerlessMassDistilledProvision.ts'
import { normalizeIndependentEvaluatorPayload } from '../lib/ai/cos/cosUniversityIndependentEvaluator.ts'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const H = 'a'.repeat(64)
const candidateId = 'mass:481a6760-75bf-46ae-9b66-0df26060c364:5100b187dfc0e16d'

test('mass runtime identity is exact, immutable and artifact-scoped', () => {
  const spec = massDistilledRuntimeSpec({
    candidateId,
    artifactHash: H,
    baseModelId: 'Qwen/Qwen3-4B',
    baseModelRevision: '1'.repeat(40),
    adapterModelId: 'cadomos/itmounts-student-74c02ee99561',
    adapterModelRevision: '2'.repeat(40),
  })
  assert.equal(spec.modelName, `itmounts-distilled-${H.slice(0, 16)}`)
  assert.equal(spec.templateName, `itmounts-distilled-${H.slice(0, 16)}-t1`)
  assert.equal(spec.endpointName, `itmounts-distilled-${H.slice(0, 16)}-e1`)
  assert.throws(() => massDistilledRuntimeSpec({
    candidateId: 'study-plan:e23cb043-715e-4406-8898-421159fae2df',
    artifactHash: H,
    baseModelId: 'Qwen/Qwen3-4B',
    baseModelRevision: '1'.repeat(40),
    adapterModelId: 'cadomos/model',
    adapterModelRevision: '2'.repeat(40),
  }), /candidate_invalid/)
})

test('mass RunPod runtime implements the provider load-balancer /ping contract before vLLM readiness', () => {
  const provision = source('../lib/ai/cos/runpodServerlessMassDistilledProvision.ts')
  assert.match(provision, /HEALTH_CHECK_PATH: '\/ping'/)
  assert.match(provision, /@app\.get\("\/ping"\)/)
  assert.match(provision, /@app\.get\("\/ready"\)/)
  assert.match(provision, /asyncio\.create_task\(bootstrap\(\)\)/)
  assert.match(provision, /vllm", "serve"/)
  assert.match(provision, /exact_cached_base_path/)
  assert.match(provision, /workers: \{ min: 0, max: 1/)
  assert.match(provision, /MAX_SERVERLESS_GPU_PRICE_PER_HOUR_USD = 0\.69/)
  assert.match(provision, /MASS_DISTILLED_STARTUP_READY_TIMEOUT_MS = 220_000/)
  assert.match(provision, /MASS_DISTILLED_CANARY_TIMEOUT_MS = 60_000/)
})

test('mass canary lane paginates, honors exact owner attempts, and enforces the exact approved cost', () => {
  const route = source('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts')
  assert.match(route, /const PAGE_SIZE = 100/)
  assert.match(route, /\.range\(offset, offset \+ PAGE_SIZE - 1\)/)
  assert.doesNotMatch(route, /\.limit\(20\)/)
  assert.match(route, /approvedInvocations = Math\.floor\(Number\(evidence\?\.maxCanaryInvocations/)
  assert.match(route, /consumed >= approval\.approvedInvocations/)
  assert.match(route, /approvedCostUsd = Number\(evidence\?\.maxEstimatedCanaryCostUsd/)
  assert.match(route, /estimatedCanaryCostUsd > approval\.approvedCostUsd \+ 1e-9/)
  assert.match(route, /mass_distilled_canary_approved_budget_too_small/)
  assert.match(route, /MAX_SERVERLESS_GPU_PRICE_PER_HOUR_USD = 0\.69/)
  assert.match(route, /productionTrafficAuthorized: false/)
})

test('independent evaluator admits only governed study-plan or mass identities', () => {
  const revision = {
    baseModel: 'Qwen/Qwen3-4B',
    datasetHash: 'b'.repeat(64),
    trainingManifestHash: 'c'.repeat(64),
    holdoutManifestHash: 'd'.repeat(64),
  }
  const payload = {
    candidateId,
    claim: 'independent_evaluation' as const,
    revision,
    trainedArtifactId: 'cadomos/itmounts-student-74c02ee99561',
    artifactHash: 'e'.repeat(64),
    evaluatorId: 'itmounts-independent-evaluator-v1',
    evaluationSuiteHash: 'f'.repeat(64),
    evidenceRef: 'db://cos_university_distilled_evaluation_runs/run-1',
    verifiedSourceAttribution: true as const,
    authorityExpanded: false as const,
    baselineScore: 0.4,
    trainedArtifactScore: 0.7,
    holdoutManifestHash: revision.holdoutManifestHash,
  }
  assert.equal(normalizeIndependentEvaluatorPayload(payload).candidateId, candidateId)
  assert.throws(() => normalizeIndependentEvaluatorPayload({ ...payload, candidateId: 'mass:bad:1234' }), /candidate_invalid/)
  assert.throws(() => normalizeIndependentEvaluatorPayload({ ...payload, candidateId: 'random:481a6760-75bf-46ae-9b66-0df26060c364:5100b187dfc0e16d' }), /candidate_invalid/)
})

test('mass evaluator normalizes authoritative campaign evidence without weakening exact artifact gates', () => {
  const evaluator = source('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
  assert.match(evaluator, /canonicalBridge/)
  assert.match(evaluator, /normalizedFromProfile: MASS_PROFILE/)
  assert.match(evaluator, /profile: FINE_TUNE_EVIDENCE_PROFILE/)
  assert.match(evaluator, /verifier: 'training_executor'/)
  assert.match(evaluator, /verifier: 'host_production_verifier'/)
  assert.match(evaluator, /trainingRights: 'open_license'/)
  assert.match(evaluator, /studentControlledByBuyer: true/)
  assert.match(evaluator, /containsPrivateProductionData: false/)
  assert.match(evaluator, /runtimeSpec\.modelName !== canary\.model/)
  assert.match(evaluator, /manifestHash\(hashes\)/)
})

test('mass evaluation selector paginates all pending artifacts and prioritizes initial work before retention', () => {
  const selector = source('../lib/ai/cos/cosUniversityMassDistilledEvaluationSelection.ts')
  const evaluator = source('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
  assert.match(selector, /const PAGE_SIZE = 100/)
  assert.match(selector, /\.range\(offset, offset \+ PAGE_SIZE - 1\)/)
  assert.match(selector, /scan\('initial', now\)/)
  assert.match(selector, /scan\('retention', now\)/)
  assert.match(selector, /if \(!prior\) return \{ selection: \{ artifact: row, run \}, sawPending \}/)
  assert.match(selector, /retentionDeferred = prior\?\.response_hashes\?\.retention\?\.deferred === true/)
  assert.match(evaluator, /selectMassDistilledEvaluationArtifact\(now\)/)
  assert.doesNotMatch(evaluator, /\.limit\(20\)/)
})

test('evaluation phases are atomically one-shot before any paid readiness or scoring call', () => {
  const evaluator = source('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
  const helper = source('../lib/ai/cos/cosUniversityMassDistilledEvaluationPhase.ts')
  const migration = source('../supabase/migrations/20260915012000_mass_distilled_evaluation_phase_claims.sql')
  assert.match(migration, /primary key \(candidate_id, artifact_hash, phase\)/)
  assert.match(migration, /on conflict \(candidate_id, artifact_hash, phase\) do nothing/)
  assert.match(migration, /automaticRetryAuthorized',false/)
  assert.match(migration, /initial_phase_not_completed/)
  assert.match(helper, /claim_cos_university_mass_distilled_evaluation_phase/)
  assert.match(helper, /complete_cos_university_mass_distilled_evaluation_phase/)
  const initialClaim = evaluator.indexOf("phase: 'initial'")
  const initialReady = evaluator.lastIndexOf('waitForMassDistilledReady(canary.endpointId)')
  const holdout = evaluator.indexOf("runSuite({ suiteName: 'holdout'")
  assert.ok(initialClaim >= 0 && initialReady > initialClaim && holdout > initialReady)
  const retentionClaim = evaluator.indexOf("phase: 'retention'")
  const retentionReady = evaluator.indexOf('waitForMassDistilledReady(canary.endpointId)', retentionClaim)
  const retentionSuite = evaluator.indexOf("runSuite({ suiteName: 'retention'", retentionReady)
  assert.ok(retentionClaim >= 0 && retentionReady > retentionClaim && retentionSuite > retentionReady)
  assert.match(evaluator, /completeMassDistilledEvaluationPhase\(\{ candidateId, artifactHash, phase: 'initial' \}\)/)
  assert.match(evaluator, /completeMassDistilledEvaluationPhase\(\{ candidateId, artifactHash, phase: 'retention' \}\)/)
})

test('failed delayed retention is terminal for the original phase and cannot auto-spend again', () => {
  const selector = source('../lib/ai/cos/cosUniversityMassDistilledEvaluationSelection.ts')
  const evaluator = source('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
  assert.match(selector, /retentionDeferred = prior\?\.response_hashes\?\.retention\?\.deferred === true/)
  assert.match(evaluator, /retention: \{ \.\.\.retention\.responseHashes, attempted: true \}/)
})

test('missing signed scorer claims repair before evaluation with zero provider or dataset work', () => {
  const repair = source('../lib/ai/cos/cosUniversityMassDistilledClaimReconciliation.ts')
  const route = source('../app/api/cron/cos-university-distilled-evaluation/route.ts')
  assert.match(repair, /providerCalls: 0/)
  assert.match(repair, /judgeCalls: 0/)
  assert.match(repair, /datasetFetches: 0/)
  assert.doesNotMatch(repair, /runpodServerless|waitForMassDistilledReady|datasets-server\.huggingface|callLocalModel/)
  const repairCall = route.indexOf('reconcileMassDistilledEvaluationClaims(new Date())')
  const evaluatorCall = route.indexOf('runUniversityMassDistilledArtifactEvaluation(new Date())')
  assert.ok(repairCall >= 0 && evaluatorCall > repairCall)
})

test('production schedules mass canary and routes mass artifacts through independent evaluation', () => {
  const vercel = source('../vercel.json')
  const route = source('../app/api/cron/cos-university-distilled-evaluation/route.ts')
  assert.match(vercel, /\/api\/cron\/runpod-mass-distilled-local-deploy/)
  assert.match(route, /reconcileMassDistilledEvaluationClaims/)
  assert.match(route, /runUniversityMassDistilledArtifactEvaluation/)
  assert.match(route, /massLaneChecked: true/)
})
