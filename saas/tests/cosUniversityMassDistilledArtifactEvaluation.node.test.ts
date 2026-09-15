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
  assert.match(provision, /INTERNAL_PORT = int/)
  assert.match(provision, /vllm", "serve"/)
  assert.match(provision, /exact_cached_base_path/)
  assert.match(provision, /workers: \{ min: 0, max: 1/)
  assert.match(provision, /MAX_SERVERLESS_GPU_PRICE_PER_HOUR_USD = 0\.69/)
  assert.match(provision, /MASS_DISTILLED_STARTUP_READY_TIMEOUT_MS = 220_000/)
  assert.match(provision, /MASS_DISTILLED_CANARY_TIMEOUT_MS = 60_000/)
})

test('mass canary lane is owner-approved, bounded and advances after an exact-artifact pass', () => {
  const route = source('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts')
  assert.match(route, /local_distilled_runtime_deploy_approved/)
  assert.match(route, /maxCanaryInvocations/)
  assert.match(route, /<= MAX_CANARY_INVOCATIONS/)
  assert.match(route, /maxEstimatedCanaryCostUsd/)
  assert.match(route, /<= 0\.2/)
  assert.match(route, /MIN_BALANCE_USD = 1/)
  assert.match(route, /hasExactCanary/)
  assert.match(route, /if \(hasExactCanary\(rows, artifactHash\)\) continue/)
  assert.match(route, /productionTrafficAuthorized: false/)
  assert.doesNotMatch(route, /RUNPOD_PRIMARY_MODE\s*=|RUNPOD_SERVERLESS_LLM_ENDPOINT_ID\s*=/)
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
  assert.match(evaluator, /teacherModelId: clean\(input\.run\.teacher_model_id/)
  assert.match(evaluator, /runtimeSpec\.modelName !== canary\.model/)
  assert.match(evaluator, /manifestHash\(hashes\)/)
})

test('mass evaluation spends only the approved 8 endpoint and 4 judge calls across initial and delayed phases', () => {
  const evaluator = source('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
  assert.match(evaluator, /const MAX_ENDPOINT_CALLS = 8/)
  assert.match(evaluator, /const MAX_JUDGE_CALLS = 4/)
  assert.match(evaluator, /MIN_MASS_DISTILLED_RETENTION_DELAY_MS = 12 \* 60 \* 60 \* 1000/)
  assert.match(evaluator, /endpointCallsThisPhase: 6/)
  assert.match(evaluator, /judgeCallsThisPhase: 3/)
  assert.match(evaluator, /endpointCallsThisPhase: 2/)
  assert.match(evaluator, /judgeCallsThisPhase: 1/)
  assert.match(evaluator, /reason: 'retention_not_due'/)
  assert.doesNotMatch(evaluator, /runCosUniversityControlledFineTuning/)
  assert.match(evaluator, /productionTrafficAuthorized: false/)
})

test('production schedules mass canary and routes mass artifacts through independent evaluation', () => {
  const vercel = source('../vercel.json')
  const route = source('../app/api/cron/cos-university-distilled-evaluation/route.ts')
  assert.match(vercel, /\/api\/cron\/runpod-mass-distilled-local-deploy/)
  assert.match(route, /runUniversityMassDistilledArtifactEvaluation/)
  assert.match(route, /massLaneChecked: true/)
})
