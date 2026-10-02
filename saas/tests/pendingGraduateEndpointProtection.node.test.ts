//
// Production 2026-09-29: mass:9c350ca1fac4 passed every gate, sat at `runtime_pending` for days, and its proven
// canary endpoint itmounts-mass-distilled-9c350ca1fac4-db505a42e0-v3 was the only mass-distilled endpoint in the
// account still holding a worker (1/1). That pin was the ONLY thing keeping it alive:
//   - it holds no graduate registry row, so activeGraduateRunpodEndpointIds (status 'active') excluded it
//   - MASS_CANARY_ACTIVE_MS is 10 minutes and MASS_EVALUATION_ACTIVE_MS is 12 minutes, both long expired
//   - it is not a Residency lease and not the primary
// The reclaim filter required min === 0, so a pinned endpoint survived by accident, not by design.
//
// Widening reclaim to stale endpoint GENERATIONS removed that accident. All 393 live mass-distilled endpoints are
// a superseded generation (391 '-v3', 2 '-v2', zero '-v5'), so the waiting artifact's endpoint became reclaimable,
// would drain to 0/0, and deleteTerminalMassDistilledRunpodEndpoint deletes exactly an endpoint at 0/0 carrying
// that name prefix. Activation binds a graduate to the EXACT endpoint id its canary proved and never recreates
// one, so a delete is unrecoverable: the identity resolver keeps returning a RunPod id that no longer exists.
//
// These tests fail the build if an artifact waiting to graduate is left unprotected again.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const protection = read('../lib/ai/cos/cosUniversityGraduateEndpointProtection.ts')
const provision = read('../lib/ai/cos/runpodMassDistilledProvisionV2.ts')
const activation = read('../app/api/cron/cos-university-graduate-activation/route.ts')

test('the protected set includes artifacts waiting to graduate, not only serving ones', () => {
  assert.match(protection, /export async function pendingGraduateRunpodEndpointIds\(\): Promise<ReadonlySet<string>>/)
  // It must actually be wired into the set every reclaim path consults.
  assert.match(
    protection,
    /const \[graduates, pendingGraduates, evaluations, canaries\] = await Promise\.all\(\[\s*\n\s*activeGraduateRunpodEndpointIds\(\),\s*\n\s*pendingGraduateRunpodEndpointIds\(\),/,
  )
  assert.match(protection, /return new Set\(\[\.\.\.graduates, \.\.\.pendingGraduates, \.\.\.evaluations, \.\.\.canaries\]\)/)
})

test('the Workforce roster protection main added is left intact', () => {
  // main replaced the 24-hour rotation lease with request-scoped Workforce serving: active graduates are protected
  // via cos_workforce_roster / status 'on_call'. The pending-graduate set is ADDITIVE to that, never a replacement.
  assert.match(protection, /\.from\('cos_workforce_roster'\)/)
  assert.match(protection, /\.eq\('status', 'on_call'\)/)
  assert.doesNotMatch(protection, /cos_university_graduate_rotation_leases/)
})

test('protection is earned from the artifact own passing exact-artifact canary', () => {
  // It must not protect anything an artifact did not already prove, and must be scoped to the exact hash
  // that is still waiting - not any historical hash for that candidate.
  assert.match(protection, /const PENDING_GRADUATE_CANARY_CLAIM = 'local_distilled_runtime_canary_passed'/)
  assert.match(protection, /\.contains\('evidence', \{ claim: PENDING_GRADUATE_CANARY_CLAIM, exactArtifact: true \}\)/)
  assert.match(protection, /\.eq\('status', 'runtime_pending'\)/)
  assert.match(protection, /\.like\('candidate_id', 'mass:%'\)/)
  assert.match(protection, /if \(wanted\.get\(candidateId\) !== String\(evidence\.artifactHash \|\| ''\)\.trim\(\)\.toLowerCase\(\)\) continue/)
  assert.match(protection, /if \(ENDPOINT_ID\.test\(endpointId\)\) ids\.add\(endpointId\)/)
  // Bounded, so a large backlog cannot turn protection into an unbounded scan.
  assert.match(protection, /const PENDING_GRADUATE_ARTIFACT_LIMIT = 200\b/)
  assert.match(protection, /\.limit\(PENDING_GRADUATE_ARTIFACT_LIMIT\)/)
})

test('protection only ever blocks a reclaim, it never raises capacity', () => {
  const start = protection.indexOf('export async function pendingGraduateRunpodEndpointIds(')
  const end = protection.indexOf('export async function protectedRunpodEndpointIds(')
  assert.ok(start > 0 && end > start)
  const body = protection.slice(start, end)
  for (const mutation of ["method: 'PATCH'", "method: 'DELETE'", 'workers:', '.update(', '.upsert(', '.insert(']) {
    assert.ok(!body.includes(mutation), `pending-graduate protection must not mutate anything, found ${mutation}`)
  }
})

test('the reclaim and delete paths this protects are still the ones that would have destroyed it', () => {
  // If either of these moves off protectedRunpodEndpointIds, the protection above stops covering it.
  assert.match(provision, /!protectedEndpointIds\.has\(clean\(endpoint\.id, 160\)\.toLowerCase\(\)\)/)
  assert.match(
    provision,
    /const reclaimable = unprotected\.filter\(endpoint =>\s*\n\s*Number\(endpoint\.workers\?\.min \?\? 0\) === 0 \|\| staleGeneration\(endpoint\)\)/,
  )
  // Every live mass endpoint is a superseded generation today, so staleGeneration alone selects all of them.
  assert.match(provision, /return !name\.endsWith\(`-\$\{MASS_DISTILLED_EXACT_ENDPOINT_GENERATION\}`\)/)
  // The delete guard is only "at 0/0 and named mass-distilled", which a drained endpoint satisfies.
  assert.match(provision, /if \(Number\(endpoint\.workers\?\.min \?\? 0\) !== 0 \|\| Number\(endpoint\.workers\?\.max \?\? 0\) !== 0\) \{\s*\n\s*throw new Error\('runpod_endpoint_gc_worker_reservation_present'\)/)

  // And activation binds to the exact canary endpoint id, which is why losing it is unrecoverable.
  assert.match(activation, /throw new Error\('graduate_runtime_exact_canary_identity_missing'\)/)
  assert.match(activation, /const runtimePolicy = await ensureMassDistilledEndpoint24Gb\(serving\.endpointId\)/)
})
// end of saas/tests/pendingGraduateEndpointProtection.node.test.ts (if this line is missing, the paste was cut short)