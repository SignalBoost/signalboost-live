// saas/tests/cosUniversityGraduateActivationCron.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const route = readFileSync('app/api/cron/cos-university-graduate-activation/route.ts', 'utf8')
const vercel = readFileSync('vercel.json', 'utf8')
const runtime = readFileSync('lib/ai/cos/cosUniversityGraduateRuntime.ts', 'utf8')

test('the activation caller exists and is scheduled — promoted graduates cannot sit pending forever', () => {
  // activateGraduateRuntime had zero callers: promotion wrote pending_runtime, COS routing read
  // active, and nothing bridged them. This cron is that bridge.
  assert.match(route, /activateGraduateRuntime\(\{/)
  assert.match(vercel, /"path": "\/api\/cron\/cos-university-graduate-activation",[\s\S]{0,120}"schedule": "7,17,27,37,47,57 \* \* \* \*"/)
})

test('activation remains fail-closed and Production explicitly enables both graduate and COS-primary adoption', () => {
  assert.match(route, /COS_GRADUATE_ACTIVATION_ENABLED/)
  assert.match(route, /COS_GENERALIST_PRIMARY_ACTIVATION_ENABLED/)
  assert.match(route, /!== 'true'/)
  assert.match(route, /graduate_activation_disabled/)
  assert.match(vercel, /"COS_GRADUATE_ACTIVATION_ENABLED": "true"/)
  assert.match(vercel, /"COS_GENERALIST_PRIMARY_ACTIVATION_ENABLED": "true"/)
})

test('every hard gate stays inside activateGraduateRuntime, not the route', () => {
  assert.match(runtime, /graduate_runtime_promotion_evidence_missing/)
  assert.match(runtime, /graduate_runtime_rollback_missing/)
  assert.match(runtime, /graduate_runtime_authority_expansion_forbidden/)
  assert.match(runtime, /health\.model !== decision\.runtimeModelId/)
  assert.doesNotMatch(route, /status: 'active'/)
})

test('subjects stay bounded while COS-primary requires the explicit A/A+ generalist gate', () => {
  const subjects = [
    'computer_science',
    'mathematics',
    'statistics_data_science',
    'physics_natural_sciences',
    'quantum_computing',
    'cybersecurity',
    'politics_government_international_relations',
    'social_behavioral_sciences',
    'economics_finance',
    'business_operations',
    'law_regulation_governance',
    'language_communication',
    'history_culture_philosophy_religion',
    'reasoning_decision_science',
  ]
  for (const subject of subjects) assert.match(route, new RegExp(`university:${subject}`))
  assert.match(route, /computer_science:[\s\S]{0,220}workerRoles: \['coder', 'critic', 'verifier', 'context_engineer'\]/)
  assert.match(route, /cybersecurity:[\s\S]{0,180}workerRoles: \['coder', 'critic', 'verifier', 'researcher'\]/)
  assert.match(route, /statistics_data_science:[\s\S]{0,220}context_engineer/)
  assert.match(route, /reasoning_decision_science:[\s\S]{0,220}context_engineer/)
  assert.match(route, /canonicalSubjectId !== 'reasoning_decision_science'/)
  assert.match(route, /readCosUniversityGeneralistGraduationStatus\(new Date\(\), 'cos'\)/)
  assert.match(route, /status\.graduated === true/)
  assert.match(route, /credentialStanding === 'A'/)
  assert.match(route, /currentStanding === 'A'/)
  assert.match(route, /status\.remediation\?\.pendingCount === 0/)
  assert.match(route, /workerRoles: \['primary', \.\.\.baseScope\.workerRoles\]/)
  assert.match(route, /problemClasses: \['\*', \.\.\.baseScope\.problemClasses\]/)
  assert.match(route, /graduate_subject_scope_undeclared/)
})

test('activation binds to the exact canary-proven RunPod endpoint and served model without static endpoint config', () => {
  assert.match(route, /servedCandidateModelFromCanary/)
  assert.match(route, /claim: 'local_distilled_runtime_canary_passed'/)
  assert.match(route, /exactArtifact: true/)
  assert.match(route, /artifactHash/)
  assert.match(route, /baseUrl: \`https:\/\/\$\{endpointId\}\.api\.runpod\.ai\/v1\`/)
  assert.match(route, /runtimeModelId: serving\.modelId/)
  assert.match(route, /runtimeBaseUrl: serving\.baseUrl/)
  assert.doesNotMatch(route, /COS_GRADUATE_AI_BASE_URL/)
  assert.doesNotMatch(route, /DISTILLED_MODEL_NAME/)
  assert.doesNotMatch(route, /DISTILLED_ADAPTER_MODEL_ID/)
  assert.match(route, /ensureMassDistilledEndpoint24Gb\(serving\.endpointId\)/)
  assert.doesNotMatch(route, /provisionMassDistilledRuntime/)
})

test('exact serving identity is resolved only after the owner activation switch', () => {
  const flag = route.indexOf("process.env[ACTIVATION_ENABLED_FLAG]")
  const resolver = route.indexOf('const serving = await resolvePendingGraduateServingIdentity')
  assert.ok(flag >= 0 && resolver > flag)
})

test('outcomes are recorded either way — success, blockers, and throws all leave evidence', () => {
  const recordCount = (route.match(/recordCosUniversityProductionPath\(/g) || []).length
  assert.ok(recordCount >= 3, `expected 3 recording sites, found ${recordCount}`)
  assert.match(route, /path: 'graduate_runtime_activation'/)
})


test('canonicalizes durable subject titles before scope lookup without widening authority', () => {
  assert.match(route, /COS_UNIVERSITY_SUBJECTS/)
  assert.match(route, /canonicalGraduateSubjectId/)
  assert.match(route, /item\.id\.toLowerCase\(\) === normalized/)
  assert.match(route, /item\.title\.toLowerCase\(\) === normalized/)
  assert.match(route, /const baseScope = SUBJECT_WORKER_SCOPE\[canonicalSubjectId\]/)
  assert.match(route, /resolveGraduateWorkerScope\(canonicalSubjectId, baseScope\)/)
  assert.match(route, /sourceSubjectId: graduate\.subject_id/)
  assert.match(route, /subjectId: canonicalSubjectId/)
  assert.match(route, /graduate_subject_scope_undeclared/)
})


test('an already-active qualified reasoning graduate upgrades to COS-primary before specialist backlog work', () => {
  assert.match(route, /\.eq\('status', 'active'\)/)
  assert.match(route, /canonicalGraduateSubjectId\(row\.subject_id\) === 'reasoning_decision_science'/)
  assert.match(route, /!activeWorkerRoles\(row\.platform_scope\)\.includes\('primary'\)/)
  assert.match(route, /if \(decision\.cosPrimary\)/)
  const activeLookup = route.indexOf(".eq('status', 'active')")
  const pendingLookup = route.indexOf(".eq('status', 'pending_runtime')")
  assert.ok(activeLookup > 0 && pendingLookup > activeLookup)
})

test('primary graduate scope is recorded distinctly and wildcard routing is explicit', () => {
  assert.match(runtime, /decision\.workerRoles\.includes\('primary'\) \? 'cos_generalist_primary'/)
  assert.match(runtime, /problemClasses\.includes\('\*'\)/)
})

test('restores only the canary-proven endpoint capacity after identity resolution and before activation', () => {
  const resolved = route.indexOf('const serving = await resolvePendingGraduateServingIdentity')
  const restored = route.indexOf('const runtimePolicy = await ensureMassDistilledEndpoint24Gb(serving.endpointId)')
  const activated = route.indexOf('const result = await activateGraduateRuntime({')
  assert.ok(resolved >= 0 && restored > resolved && activated > restored)
  assert.match(route, /servingWorkersMin: runtimePolicy\.workersMin/)
  assert.match(route, /servingWorkersMax: runtimePolicy\.workersMax/)
  assert.doesNotMatch(route, /provisionMassDistilledRuntime/)
})


test('active graduate routing matches University subjects and accepts pre-namespace active scopes', () => {
  assert.match(runtime, /classifyCosUniversitySubjects/)
  assert.match(runtime, /const universitySubjects = classifyCosUniversitySubjects\(objective\)/)
  assert.match(runtime, /problemClasses\.includes\(\`university:\$\{subjectId\}\`\)/)
  assert.match(runtime, /problemClasses\.includes\(subjectId\)/)
  assert.match(runtime, /problemClasses\.includes\(problemClass\)[\s\S]{0,100}universityScoped/)
})


test('healthy idle activation ticks still emit Production-path evidence for Self-Healing', () => {
  const idleReason = "reason: 'no_pending_runtime_or_primary_upgrade_candidate'"
  const idleAt = route.indexOf(idleReason)
  assert.ok(idleAt > 0)
  const idleWindow = route.slice(Math.max(0, idleAt - 900), idleAt + 500)
  assert.match(idleWindow, /recordCosUniversityProductionPath\(\{/)
  assert.match(idleWindow, /path: 'graduate_runtime_activation'/)
  assert.match(idleWindow, /invocationSucceeded: true/)
  assert.match(idleWindow, /skipped: true/)

  const primaryGateAt = route.indexOf("reason: scopeDecision.primaryGate")
  assert.ok(primaryGateAt > 0)
  const primaryWindow = route.slice(Math.max(0, primaryGateAt - 900), primaryGateAt + 500)
  assert.match(primaryWindow, /recordCosUniversityProductionPath\(\{/)
  assert.match(primaryWindow, /invocationSucceeded: true/)
})


test('every activation tick records why the COS-primary upgrade did or did not happen', () => {
  assert.match(route, /let primaryUpgrade: Record<string, unknown> = \{ considered: false, primaryGate: 'generalist_primary_disabled' \}/)
  assert.match(route, /primaryGate: 'no_active_reasoning_graduate_awaiting_primary'/)
  assert.match(route, /considered: true, candidateId: primaryCandidate\.candidate_id, cosPrimary: decision\.cosPrimary, primaryGate: decision\.primaryGate, \.\.\.decision\.gateEvidence/)
  const idleAt = route.indexOf("reason: 'no_pending_runtime_or_primary_upgrade_candidate'")
  assert.match(route.slice(idleAt, idleAt + 250), /primaryUpgrade,/)
  assert.match(route, /generalistGraduated: status\.graduated === true/)
  assert.match(route, /credentialStanding: String\(credentialStanding/)
  assert.match(route, /currentStanding: String\(currentStanding/)
  assert.match(route, /remediationPending: Number\.isFinite\(remediationPending\)/)
  assert.match(route, /\(credentialStanding === 'A' \|\| credentialStanding === 'A\+'\)/)
  assert.match(route, /\(currentStanding === 'A' \|\| currentStanding === 'A\+'\)/)
})


test('activation cron deterministically drives governed graduate work rotation without a separate cron slot', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cron/cos-university-graduate-activation/route.ts'), 'utf8')
  const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'))
  assert.match(route, /\/api\/cron\/cos-university-graduate-rotation/)
  assert.match(route, /cos-graduate-work-rotation-piggyback/)
  assert.match(route, /SignalBoost-Graduate-Activation/)
  assert.equal(vercel.crons.some((item: any) => item.path === '/api/cron/cos-university-graduate-rotation'), false)
  assert.equal(vercel.crons.some((item: any) => item.path === '/api/cron/cos-university-graduate-activation'), true)
})
