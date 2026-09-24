// saas/tests/runpodMassDistilled24GbPolicy.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const provisionV2 = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
const provisionLegacy = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvision.ts', import.meta.url), 'utf8')
const endpointProtection = readFileSync(new URL('../lib/ai/cos/cosUniversityGraduateEndpointProtection.ts', import.meta.url), 'utf8')
const deployRoute = readFileSync(new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts', import.meta.url), 'utf8')
const evaluationRoute = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')

test('mass-distilled evaluator runtime stays narrowed to AMPERE_24 only', () => {
  assert.match(provisionV2, /const APPROVED_POOLS = \['AMPERE_24'\] as const/)
  assert.match(provisionV2, /const CANARY_APPROVED_POOLS = \['AMPERE_24', 'AMPERE_16'\] as const/)
  assert.match(provisionV2, /export async function ensureMassDistilledEndpoint24Gb/)
  assert.match(provisionV2, /provisionMassDistilledRuntimeWithPools\(input, APPROVED_POOLS\)/)
})

test('short canary gets 24-to-16GB availability fallback before the paid invocation marker', () => {
  const provisionIndex = deployRoute.indexOf('provisionMassDistilledCanaryRuntime(runtimeArtifact)')
  const invocationIndex = deployRoute.indexOf('claim:INVOCATION_STARTED')
  assert.ok(provisionIndex >= 0)
  assert.ok(invocationIndex > provisionIndex)
  assert.match(provisionV2, /export async function provisionMassDistilledCanaryRuntime/)
  assert.match(provisionV2, /provisionMassDistilledRuntimeWithPools\(input, CANARY_APPROVED_POOLS\)/)
  assert.match(provisionV2, /gpu: \{ pools: \[\.\.\.approvedPools\], count: 1 \}/)
})

test('independent evaluator reasserts 24GB endpoint policy before readiness or inference', () => {
  assert.match(provisionV2, /export async function ensureMassDistilledEndpoint24Gb\(endpointId: string\)/)
  const preflightIndex = evaluationRoute.indexOf('ensureMassDistilledEndpoint24Gb(claim.endpointId)')
  const evaluationIndex = evaluationRoute.indexOf('runMassDistilledArtifactEvaluation({ claim, deadlineMs')
  assert.ok(preflightIndex >= 0)
  assert.ok(evaluationIndex > preflightIndex)
  assert.match(evaluationRoute, /cos-mass-distilled-runtime-preflight/)
})

test('24GB repair preserves one-worker and scale-to-zero safety validation', () => {
  assert.match(provisionV2, /Number\(endpoint\.workers\?\.min \?\? Number\.NaN\) !== 0/)
  assert.match(provisionV2, /Number\(endpoint\.workers\?\.max \?\? Number\.NaN\) > 1/)
  assert.match(provisionV2, /Number\(endpoint\.gpu\?\.count \?\? Number\.NaN\) !== 1/)
})

test('evaluation restores the one worker a retired endpoint is allowed, before it probes readiness', () => {
  const provisionV2 = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
  // Production 2026-09-17 19:04 and 19:14 UTC: mass:481a6760 passed its canary at 17:27, a later canary retired its
  // endpoint to max 0 workers, and evaluation then failed with runtime_not_ready:network.
  assert.match(provisionV2, /async function restoreRetiredEndpointCapacity\(endpoint: Endpoint, idleTimeoutSeconds = IDLE_TIMEOUT_SECONDS\)/)
  assert.match(provisionV2, /if \(maxWorkers >= 1 && idleTimeout === idleTimeoutSeconds\) return endpoint/)
  assert.match(provisionV2, /body: JSON\.stringify\(\{ workers: \{ min: 0, max: 1, idleTimeout: idleTimeoutSeconds \} \}\)/)
  assert.match(provisionV2, /mass_distilled_runtime_capacity_restore_rejected/)
  assert.match(provisionV2, /const endpoint = await restoreRetiredEndpointCapacity\(await constrainEndpointToApprovedGpu/)
  // The evaluator keeps scale-to-zero and one worker max, but normalizes idle to 180s so a worker that finishes
  // cold bootstrap just after one 2-minute cron cycle remains available for the next bounded retry.
  assert.doesNotMatch(provisionV2, /max: [2-9]|min: [1-9]/)
  assert.match(provisionV2, /const IDLE_TIMEOUT_SECONDS = 180/)
  assert.match(provisionV2, /if \(maxWorkers >= 1 && idleTimeout === idleTimeoutSeconds\) return endpoint/)
  assert.match(provisionV2, /export const MASS_DISTILLED_RESIDENCY_IDLE_TIMEOUT_SECONDS = 720/)
  assert.match(provisionV2, /if \(input\.idleTimeoutSeconds === undefined\) return IDLE_TIMEOUT_SECONDS/)
  assert.ok((720 / 3600) * 0.69 < 0.2, '720s Residency warm retry bridges the 10-minute cron while staying below the existing $0.20 canary cost ceiling at the approved GPU price cap')
  assert.ok((180 / 3600) * 0.69 < 0.2, '180s at the approved $0.69\/hr ceiling stays below wake authority')
  assert.match(provisionLegacy, /httpx\.AsyncClient\(timeout=120\.0\)/)
})


test('evaluator quota repair only releases sibling mass-distilled worker reservations and retries boundedly', () => {
  assert.match(provisionV2, /function runpodWorkerQuotaError/)
  assert.match(provisionV2, /max workers across all endpoints must not exceed your workers quota/)
  assert.match(provisionV2, /clean\(endpoint\.name, 240\)\.startsWith\('itmounts-mass-distilled-'\)/)
  assert.match(provisionV2, /clean\(endpoint\.id, 160\) !== activeEndpointId/)
  assert.match(provisionV2, /workers: \{ min: 0, max: 0, idleTimeout \}/)
  assert.match(provisionV2, /await releaseOtherMassEndpointCapacity\(String\(endpoint\.id\)\)/)
  assert.doesNotMatch(provisionV2, /max: 2|min: 1/)
})


test('capacity reclamation never disables active graduate, evaluator, or Residency endpoints', () => {
  assert.match(provisionLegacy, /protectedRunpodEndpointIds/)
  assert.match(provisionLegacy, /activeResidencyRunpodEndpointNames/)
  assert.match(provisionLegacy, /!protectedEndpointIds\.has\(clean\(endpoint\.id,160\)\.toLowerCase\(\)\)/)
  assert.match(provisionLegacy, /!protectedResidencyEndpointNames\.has\(clean\(endpoint\.name,240\)\)/)
  assert.match(provisionV2, /protectedRunpodEndpointIds/)
  assert.match(provisionV2, /activeResidencyRunpodEndpointNames/)
  assert.match(provisionV2, /!protectedEndpointIds\.has\(clean\(endpoint\.id, 160\)\.toLowerCase\(\)\)/)
  assert.match(provisionV2, /!protectedResidencyEndpointNames\.has\(clean\(endpoint\.name, 240\)\)/)

  assert.match(endpointProtection, /cos_university_residency_case_runs/)
  assert.match(endpointProtection, /\.eq\('status', 'started'\)/)
  assert.match(endpointProtection, /RESIDENCY_ENDPOINT_LEASE_MS = 15 \* 60_000/)
  assert.match(endpointProtection, /cos_university_residency_enrollments/)
  assert.match(endpointProtection, /builder-residency-runtime-v1/)
  assert.match(endpointProtection, /residency_endpoint_protection_database_unavailable/)
  assert.match(endpointProtection, /cos_university_graduate_model_registry/)
  assert.match(endpointProtection, /\.eq\('status', 'active'\)/)
  assert.match(endpointProtection, /\.eq\('runtime_provider', 'runpod'\)/)
  assert.match(endpointProtection, /graduate_endpoint_protection_database_unavailable/)

  assert.match(endpointProtection, /MASS_EVALUATION_PROFILE = 'cos_mass_distilled_independent_evaluation_runtime_v1'/)
  assert.match(endpointProtection, /mass_distilled_independent_evaluation_started/)
  assert.match(endpointProtection, /reservationOnly === true/)
  assert.match(endpointProtection, /mass_distilled_independent_evaluation_completed/)
  assert.match(endpointProtection, /mass_distilled_independent_evaluation_failed/)
  assert.match(endpointProtection, /MASS_EVALUATION_ACTIVE_MS = 12 \* 60 \* 1000/)
  assert.match(endpointProtection, /evaluation_endpoint_protection_database_unavailable/)
  assert.match(endpointProtection, /new Set\(\[\.\.\.graduates, \.\.\.evaluations\]\)/)
})


test('evaluator waits for RunPod quota settlement and defers cleanly when protected capacity remains full', () => {
  assert.match(provisionV2, /async function withWorkerQuotaRecovery/)
  assert.match(provisionV2, /for \(let attempt = 0; attempt < 4; attempt \+= 1\)/)
  assert.match(provisionV2, /750 \* \(attempt \+ 1\)/)
  assert.match(provisionV2, /withWorkerQuotaRecovery\(String\(endpoint\.id\), patchGpu\)/)
  assert.match(provisionV2, /withWorkerQuotaRecovery\(String\(endpoint\.id\), restore\)/)
  assert.match(evaluationRoute, /workerQuotaDeferred/)
  assert.match(evaluationRoute, /reason: 'runpod_worker_quota_full'/)
  assert.match(evaluationRoute, /retryable: true/)
  assert.match(evaluationRoute, /\{ status: 200 \}/)
})


test('active evaluator endpoint self-drains only when a GPU policy PATCH hits account quota', () => {
  assert.match(provisionV2, /originalMaxWorkers = Math\.max\(0, Math\.min\(1/)
  assert.match(provisionV2, /endpointName\.startsWith\('itmounts-mass-distilled-'\)/)
  assert.match(provisionV2, /mass_distilled_runtime_quota_self_drain_rejected/)
  assert.match(provisionV2, /workers: \{ min: 0, max: 0, idleTimeout: idleTimeoutSeconds \}/)
  assert.match(provisionV2, /restoreRetiredEndpointCapacity\(endpoint, idleTimeoutSeconds, approvedPools\)/)
  assert.doesNotMatch(provisionV2, /method: 'DELETE'/)
  assert.doesNotMatch(provisionV2, /max: [2-9]|min: [1-9]/)
})

test('quota self-drain cannot touch non-mass or already-retired endpoints', () => {
  assert.match(provisionV2, /!runpodWorkerQuotaError\(error\)/)
  assert.match(provisionV2, /originalMaxWorkers < 1/)
  assert.match(provisionV2, /!endpointName\.startsWith\('itmounts-mass-distilled-'\)/)
  assert.match(provisionV2, /throw error/)
})
