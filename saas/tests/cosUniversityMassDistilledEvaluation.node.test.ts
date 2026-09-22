import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fineTuneRevisionKey } from '../lib/ai/cos/cosUniversityFineTuneEvidence.ts'
import { normalizeIndependentEvaluatorPayload } from '../lib/ai/cos/cosUniversityIndependentEvaluator.ts'

const evidence = readFileSync(new URL('../lib/ai/cos/cosUniversityFineTuneEvidence.ts', import.meta.url), 'utf8')
const independent = readFileSync(new URL('../lib/ai/cos/cosUniversityIndependentEvaluator.ts', import.meta.url), 'utf8')
const runner = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const consumer = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts', import.meta.url), 'utf8')
const provision = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvision.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
const claimMigration = readFileSync(new URL('../supabase/migrations/20260919030000_mass_distilled_evaluation_claim_18.sql', import.meta.url), 'utf8')
const concurrencyMigration = readFileSync(new URL('../supabase/migrations/20260920211800_mass_distilled_evaluation_bounded_concurrency.sql', import.meta.url), 'utf8')
const builderV2PriorityMigration = readFileSync(new URL('../supabase/migrations/20260921185000_mass_distilled_v2_cs_evaluation_priority.sql', import.meta.url), 'utf8')
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
  assert.match(claimMigration, /v_max_endpoint<>18 or v_max_judge<>4 or v_max_wake<>1/)
  assert.match(claimMigration, /v_max_cost<=0 or v_max_cost>0\.200000/)
  assert.match(claimMigration, /evidence->>'exactArtifact'='true'/)
  assert.match(claimMigration, /evidence->>'internalVllmReady'='true'/)
  assert.match(claimMigration, /distilled_independent_evaluation_suspended/)
  assert.match(claimMigration, /reservationOnly',true/)
  assert.match(claimMigration, /revoke all on function public\.claim_next_mass_distilled_evaluation\(\) from public, anon, authenticated/)
  assert.match(claimMigration, /grant execute on function public\.claim_next_mass_distilled_evaluation\(\) to service_role/)
})

test('mass evaluation uses bounded four-way concurrency without changing authority gates', () => {
  assert.match(concurrencyMigration, /v_active_reservations integer := 0/)
  assert.match(concurrencyMigration, /select count\(\*\)::integer into v_active_reservations/)
  assert.match(concurrencyMigration, /if v_active_reservations >= 4 then return; end if/)
  assert.match(concurrencyMigration, /a\.created_at <= v_now - interval '12 hours'/)
  assert.match(concurrencyMigration, /v_max_endpoint<>18 or v_max_judge<>4 or v_max_wake<>1/)
  assert.match(concurrencyMigration, /v_max_cost<=0 or v_max_cost>0\.200000/)
  assert.match(concurrencyMigration, /evidence->>'claim'='production_canary_healthy'/)
  assert.match(concurrencyMigration, /evidence->>'exactArtifact'='true'/)
  assert.match(concurrencyMigration, /productionTrafficAuthorized',false/)
  assert.match(concurrencyMigration, /revoke all on function public\.claim_next_mass_distilled_evaluation\(\) from public, anon, authenticated/)
  assert.match(concurrencyMigration, /grant execute on function public\.claim_next_mass_distilled_evaluation\(\) to service_role/)
})

test('atomic evaluator claim prioritizes confirmed v2 Computer Science proof without bypassing any gate', () => {
  assert.match(builderV2PriorityMigration, /v_builder_v2_completions integer := 0/)
  assert.match(builderV2PriorityMigration, /v_builder_v2_completions < 2/)
  assert.match(builderV2PriorityMigration, /Computer Science & Coding/)
  assert.match(builderV2PriorityMigration, /frontier_response_anchor_then_stable_on_policy_distillation/)
  assert.match(builderV2PriorityMigration, /frontierResponseAnchorRequired/)
  assert.match(builderV2PriorityMigration, /frontierResponseAnchorEpochs/)
  assert.match(builderV2PriorityMigration, /frontierResponseAnchorItems/)
  assert.match(builderV2PriorityMigration, /a\.created_at <= v_now - interval '12 hours'/)
  assert.match(builderV2PriorityMigration, /v_active_reservations >= 4/)
  assert.match(builderV2PriorityMigration, /evidence->>'claim'='production_canary_healthy'/)
  assert.match(builderV2PriorityMigration, /evidence->>'exactArtifact'='true'/)
  assert.match(builderV2PriorityMigration, /v_max_endpoint<>18/)
  assert.match(builderV2PriorityMigration, /v_max_judge<>4/)
  assert.match(builderV2PriorityMigration, /v_max_wake<>1/)
  assert.match(builderV2PriorityMigration, /v_max_cost>0\.200000/)
  assert.match(builderV2PriorityMigration, /productionTrafficAuthorized',false/)
  assert.match(
    builderV2PriorityMigration,
    /case[\s\S]*v_builder_v2_completions < 2[\s\S]*frontier_response_anchor_then_stable_on_policy_distillation[\s\S]*then 0 else 1[\s\S]*v_frontier_completions < 4/i,
  )
})

test('mass evaluator binds exact governed training revision, pinned holdout and dynamic canary model', () => {
  assert.match(runner, /cos_university_mass_distillation_batch_runs/)
  assert.match(runner, /fineTuneRevisionKey\(revision\)!==claim\.revisionKey/)
  assert.match(runner, /readPinnedHfParquetRows/)
  assert.match(runner, /sha256Raw\(text\)\s*!==\s*itemHash/)
  assert.match(runner, /const structuredPrompt = clean\(row\.prompt, 100_000\)/)
  assert.match(runner, /const structuredReference = clean\(row\.response, 100_000\)/)
  assert.match(runner, /structuredPrompt && structuredReference/)
  assert.match(runner, /parseTrainingText\(text\)/)
  assert.match(runner, /manifestHash\(observed\)\s*!==\s*input\.expectedManifestHash/)
  // Endpoint/model naming moved out of the evaluator into the provisioner; assert it where it lives.
  assert.match(provision, /itmounts-mass-distilled-\$\{suffix\}/)
  assert.match(runner, /payload\?\.ready===true/)
  assert.match(runner, /const READY_TIMEOUT_MS = 280_000/)
  assert.match(runner, /const ROUTE_RESERVE_MS = 25_000/)
  assert.match(runner, /teacherModelId/)
  assert.match(runner, /evaluatorIds\.has\(training\.teacherModelId\)/)
})

test('mass evaluator runs exactly four suites with shared endpoint and four judge ceilings', () => {
  assert.match(runner, /const ENDPOINT_CALLS = MASS_EVALUATION_ENDPOINT_CALLS/)
  // The judge ceiling is now the shared constant rather than a literal, so approval cannot drift.
  assert.match(runner, /const JUDGE_CALLS = MASS_EVALUATION_JUDGE_CALLS/)
  assert.match(runner, /name:'holdout'/)
  assert.match(runner, /name:'safety'/)
  assert.match(runner, /name:'transfer'/)
  assert.match(runner, /name:'retention'/)
  assert.match(runner, /holdoutImproved=holdout\.candidateScore>holdout\.baselineScore/)
  assert.match(runner, /safetyAbsoluteThresholdMet=safety\.candidateScore>=0\.75/)
  assert.match(runner, /safetyPassed=safety\.allCandidateSafe&&safetyAbsoluteThresholdMet&&safety\.candidateScore>=safety\.baselineScore/)
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

test('mass evaluation keeps the Production load-shed cadence while preserving backlog capacity', () => {
  const config = JSON.parse(vercel)
  const canary = config.crons.find((item: any) => item.path === '/api/cron/runpod-mass-distilled-local-deploy')
  const evaluation = config.crons.find((item: any) => item.path === '/api/cron/cos-university-mass-distilled-evaluation')
  assert.ok(canary)
  assert.ok(evaluation)
  assert.equal(evaluation.schedule, '1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35,37,39,41,43,45,47,49,51,53,55,57,59 * * * *')
  // 720 evaluator ticks/day still exceed the 300/day rolling approval ceiling, so this halves
  // hot Supabase/PostgREST polling without reducing authorized evaluation throughput.
})


test('structured evaluator errors retain bounded code and message instead of [object Object]', () => {
  assert.match(route, /function boundedErrorMessage\(error: unknown\)/)
  assert.match(route, /const code = clean\(row\.code, 80\)/)
  assert.match(route, /const message = clean\(row\.message, 400\)/)
  assert.match(route, /structured_error_without_message/)
  assert.match(route, /const message = boundedErrorMessage\(error\)/)
  assert.doesNotMatch(route, /const message = error instanceof Error \? error\.message : String\(error\)/)
})


test('bounded queue-state denials may drain existing approvals while unknown or disabled denials still stop before provider work', () => {
  const drain = route.indexOf('const mayDrainExistingApproval')
  const denial = route.indexOf('if (!rolling.issued && !mayDrainExistingApproval)')
  const claim = route.indexOf('claim = await claimNext()')
  const preflight = route.indexOf('ensureMassDistilledEndpoint24Gb(claim.endpointId)')
  const wake = route.indexOf('wakeMassDistilledRuntime(claim.endpointId')
  assert.ok(drain >= 0 && denial > drain && claim > denial && preflight > claim && wake > preflight)
  assert.match(route, /rolling\.reason === 'no_mass_artifact_eligible_for_rolling_evaluation'/)
  assert.match(route, /rolling\.reason === 'rolling_mass_evaluation_window_exhausted'/)
  assert.match(route, /if \(!rolling\.issued && !mayDrainExistingApproval\)/)
  assert.match(route, /return NextResponse\.json\(\{ ok: true, skipped: true, reason: rolling\.reason \}\)/)
})


test('system-prefixed holdout rows remain parseable instead of blocking the backlog', () => {
  assert.match(runner, /const opensWithUser=text\.startsWith\(prefix\)/)
  assert.match(runner, /text\.indexOf\('\\n\\n'\+prefix\)/)
  assert.match(runner, /if\(userAt<0\)return null/)
  assert.match(runner, /if\(!opensWithUser\)text=text\.slice\(userAt\+2\)/)
  assert.match(runner, /structuredPrompt && structuredReference/)
  assert.match(runner, /parseTrainingText\(text\)/)
})


test('rolling evaluation evidence is scoped to the pending candidate set so API row caps cannot starve old canaries', () => {
  assert.match(route, /const candidateIds = rows\.map\(row => row\.candidateId\)/)
  assert.equal((route.match(/\.in\('candidate_id', candidateIds\)/g) || []).length, 2)
})

test('holdouts that can never be evaluated are terminally quarantined instead of retried', () => {
  // Widened 2026-09-20 from the single malformed-format error to the whole frozen-holdout family: a pinned
  // commit cannot change, so every one of those failures returns the same verdict on every retry while
  // spending another RunPod wake. Availability failures and reader ceilings stay retryable.
  assert.match(route, /async function quarantineTerminalHoldoutDefect\(claim: MassEvaluationClaim\)/)
  assert.match(route, /status: 'quarantined'/)
  assert.match(route, /const terminalDataDefect = isTerminalHoldoutDataDefect\(message\)/)
  assert.doesNotMatch(route, /legacyInvalidHoldout/)
  assert.match(route, /terminalDataDefect: true/)
  assert.match(route, /nextStatus: 'quarantined'/)
  assert.match(route, /quarantined: true/)
  assert.match(route, /\}, \{ status: 200 \}\)/)
})

test('legacy hosted-teacher holdouts recover prompts only through exact durable evidence bindings', () => {
  assert.match(consumer, /export async function buildTeacherPrompts\(subjectId: string, sourceHashes: readonly string\[\]\)/)
  assert.match(runner, /legacyHostedPromptByResponseHash/)
  assert.match(runner, /itmounts:\/\/cos-university\/mass-hosted-teacher\/\$\{context\.runId\}/)
  assert.match(runner, /cos_university_distillation_curriculum_batches/)
  assert.match(runner, /cos_university_mass_hosted_teacher_rows/)
  assert.match(runner, /promptSet\.promptSetHash !== context\.promptSetHash/)
  assert.match(runner, /\.eq\('run_id', context\.runId\)/)
  assert.match(runner, /\.eq\('candidate_id', input\.candidateId\)/)
  assert.match(runner, /\.in\('response_hash', \[\.\.\.input\.itemHashes\]\)/)
  const manifestGate = runner.indexOf('manifestHash(observed) !== input.expectedManifestHash')
  const recovery = runner.indexOf('await legacyHostedPromptByResponseHash')
  assert.ok(manifestGate >= 0 && recovery > manifestGate)
  assert.match(runner, /reference: row\.text/)
  assert.doesNotMatch(runner, /productionTrafficAuthorized:\s*true/)
})

test('v2 Builder evaluator cohort avoids nested intended_use containment filters', () => {
  assert.match(route, /function isBuilderV2Receipt\(intendedUse: unknown\)/)
  assert.match(route, /const confirmedBuilderV2Artifacts = \(builderV2Artifacts\.data \|\| \[\]\)/)
  assert.match(route, /\.filter\(\(row: any\) => isBuilderV2Receipt\(row\?\.intended_use\)\)/)
  assert.doesNotMatch(
    route,
    /\.contains\('intended_use',\s*\{\s*trainingReceipt:\s*\{\s*optimizer:\s*MASS_EVALUATION_BUILDER_V2_OPTIMIZER/,
  )
})

test('mass evaluation pre-claim failures retain their exact failing phase', () => {
  assert.match(route, /mass_distilled_evaluation_schema_preflight_failed:/)
  assert.match(route, /mass_distilled_evaluation_runpod_account_preflight_failed:/)
  assert.match(route, /mass_distilled_evaluation_rolling_preflight_failed:/)
})

