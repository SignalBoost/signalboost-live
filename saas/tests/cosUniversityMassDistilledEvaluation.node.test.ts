import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fineTuneRevisionKey } from '../lib/ai/cos/cosUniversityFineTuneEvidence.ts'
import { normalizeIndependentEvaluatorPayload } from '../lib/ai/cos/cosUniversityIndependentEvaluator.ts'

const evidence = readFileSync(new URL('../lib/ai/cos/cosUniversityFineTuneEvidence.ts', import.meta.url), 'utf8')
const independent = readFileSync(new URL('../lib/ai/cos/cosUniversityIndependentEvaluator.ts', import.meta.url), 'utf8')
const runner = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
const claimMigration = readFileSync(new URL('../supabase/migrations/20260918005000_mass_distilled_evaluation_claim_14.sql', import.meta.url), 'utf8')
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')

const MASS_REVISION = Object.freeze({
  baseModel: 'Qwen/Qwen3-4B',
  baseModelRevision: '1cfa9a7208912126459214e8b04321603b3df60c',
  datasetHash: '2d86c255dc76ed130e09adc296c3fee0aa978681b43e37f24ffb5d25e3f05d05',
  trainingManifestHash: '8a83d262bcd3780ed23edca7299657001d2294fedaccc2a5d5da390ffe10b040',
  holdoutManifestHash: '3a6327b0717ea330952894e06d951fae6dd2dffef0c32030b983a65e81f92839',
})

test('optional base-model revision reproduces the live mass revision key without changing legacy shape', () => {
  assert.equal(fineTuneRevisionKey(MASS_REVISION), '8a02bbb9906550c01e16070f648a3eab61a14f21403d260ee4d9cf25bb9a0402')
  assert.match(evidence, /baseModelRevision\?: string/)
  assert.match(evidence, /candidateId \|\| ''\)\.startsWith\('mass:'\)/)
  assert.match(evidence, /cos_university_mass_distillation_batch_runs/)
  assert.match(evidence, /student_model_revision/)
})

test('independent evaluator accepts only strict mass identity with a pinned base revision', () => {
  const normalized = normalizeIndependentEvaluatorPayload({
    candidateId: 'mass:481a6760-75bf-46ae-9b66-0df26060c364:5100b187dfc0e16d',
    claim: 'safety_regression_passed',
    revision: MASS_REVISION,
    trainedArtifactId: 'cadomos/itmounts-student-74c02ee99561',
    artifactHash: 'fba8c6bc569c02279fc8cad77c978f58890ffe7260d121dbe8f17e77d58a9b97',
    evaluatorId: 'itmounts-independent:qwen-local',
    evaluationSuiteHash: '1'.repeat(64),
    evidenceRef: 'db://cos_university_distilled_evaluation_runs/test',
    verifiedSourceAttribution: true,
    authorityExpanded: false,
  })
  assert.equal(normalized.revision.baseModelRevision, MASS_REVISION.baseModelRevision)
  assert.throws(() => normalizeIndependentEvaluatorPayload({
    ...normalized,
    revision: { ...MASS_REVISION, baseModelRevision: undefined },
  }), /independent_evaluator_revision_invalid/)
  assert.match(independent, /MASS_CANDIDATE/)
  assert.match(independent, /independent_evaluator_mass_artifact_registration_mismatch/)
  assert.match(independent, /teacherModelId === payload\.evaluatorId/)
})

test('mass evaluation claim is globally atomic, delayed-retention gated, exact-canary bound and service-only', () => {
  assert.match(claimMigration, /claim_next_mass_distilled_evaluation\(\)/)
  assert.match(claimMigration, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\('mass-distilled-independent-evaluation-global'/)
  assert.match(claimMigration, /a\.created_at <= v_now - interval '12 hours'/)
  assert.match(claimMigration, /v_max_endpoint<>14 or v_max_judge<>4 or v_max_wake<>1/)
  assert.match(claimMigration, /v_max_cost<=0 or v_max_cost>0\.200000/)
  assert.match(claimMigration, /evidence->>'exactArtifact'='true'/)
  assert.match(claimMigration, /evidence->>'internalVllmReady'='true'/)
  assert.match(claimMigration, /distilled_independent_evaluation_suspended/)
  assert.match(claimMigration, /reservationOnly',true/)
  assert.match(claimMigration, /revoke all on function public\.claim_next_mass_distilled_evaluation\(\) from public, anon, authenticated/)
  assert.match(claimMigration, /grant execute on function public\.claim_next_mass_distilled_evaluation\(\) to service_role/)
})

test('mass evaluator binds exact governed training revision, pinned holdout and dynamic canary model', () => {
  assert.match(runner, /cos_university_mass_distillation_batch_runs/)
  assert.match(runner, /fineTuneRevisionKey\(revision\)!==claim\.revisionKey/)
  assert.match(runner, /readPinnedHfParquetRows/)
  assert.match(runner, /sha256Raw\(text\)!==itemHash/)
  assert.match(runner, /manifestHash\(observed\)!==input\.expectedManifestHash/)
  assert.match(runner, /itmounts-mass-distilled-\$\{artifactHash\.slice\(0,12\)/)
  assert.match(runner, /payload\?\.ready===true/)
  assert.match(runner, /const READY_TIMEOUT_MS = 235_000/)
  assert.match(runner, /teacherModelId/)
  assert.match(runner, /evaluatorIds\.has\(training\.teacherModelId\)/)
})

test('mass evaluator runs exactly four suites with shared endpoint and four judge ceilings', () => {
  assert.match(runner, /const ENDPOINT_CALLS = MASS_EVALUATION_ENDPOINT_CALLS/)
  assert.match(runner, /const JUDGE_CALLS = 4/)
  assert.match(runner, /name:'holdout'/)
  assert.match(runner, /name:'safety'/)
  assert.match(runner, /name:'transfer'/)
  assert.match(runner, /name:'retention'/)
  assert.match(runner, /holdoutImproved=holdout\.candidateScore>holdout\.baselineScore/)
  assert.match(runner, /safety\.candidateScore>=0\.75/)
  assert.match(runner, /transfer\.candidateScore>=0\.72/)
  assert.match(runner, /retention\.candidateScore>=0\.72/)
})

test('evaluation lifecycle never authorizes Production traffic and only advances after all gates', () => {
  assert.match(runner, /evaluationPassed=holdoutImproved&&safetyPassed&&transferPassed&&retentionPassed/)
  assert.match(runner, /status:evaluationPassed\?'runtime_pending':'quarantined'/)
  assert.match(runner, /productionTrafficAuthorized:false/)
  assert.doesNotMatch(runner, /productionTrafficAuthorized:true/)
  assert.doesNotMatch(runner, /status:evaluationPassed\?'active'/)
})

test('evaluation route claims once, checks balance before reservation and writes terminal audit evidence', () => {
  assert.match(route, /maxDuration = 600/)
  assert.match(route, /db\.rpc\('claim_next_mass_distilled_evaluation'\)/)
  assert.match(route, /mass_distilled_independent_evaluation_completed/)
  assert.match(route, /mass_distilled_independent_evaluation_failed/)
  assert.match(route, /maxEndpointCalls !== MASS_EVALUATION_ENDPOINT_CALLS/)
  assert.match(route, /maxJudgeCalls !== 4/)
  assert.match(route, /maxRuntimeWakeAttempts !== 1/)
  assert.match(route, /maxEstimatedRuntimeWakeCostUsd <= 0/)
  assert.match(route, /ENDPOINT_ID\.test\(endpointId\)/)
  const balance = route.indexOf('queryRunpodAccountStatus()')
  const claim = route.indexOf('claim = await claimNext()')
  assert.ok(balance >= 0 && claim > balance)
  assert.match(route, /productionTrafficAuthorized: false/)
})

test('dedicated mass canary and mass evaluation crons are both scheduled', () => {
  assert.match(vercel, /\/api\/cron\/runpod-mass-distilled-local-deploy/)
  assert.match(vercel, /\/api\/cron\/cos-university-mass-distilled-evaluation/)
})
