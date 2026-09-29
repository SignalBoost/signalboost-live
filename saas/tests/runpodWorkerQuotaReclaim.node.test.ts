// saas/tests/runpodWorkerQuotaReclaim.node.test.ts
//
// Production 2026-09-29 19:13-21:23 UTC: every exam wake died on
//   "RunPod PATCH /serverless/... HTTP 400: Max workers across all endpoints must not exceed your workers
//    quota (10). ... lower the max worker count for this endpoint to at most 0."
// 6 failures, and no exam completed after 17:21 while 44 examinable artifacts waited. By then
// withWorkerQuotaRecovery had reclaimed four times and activateMassDistilledEvaluationWorker had surrendered
// its own max=1 reservation, so every remaining worker was one the reclaim filter could not touch.
//
// Two defects, both fixed here:
//  1. The filter required min === 0, so an endpoint pinned always-on was permanently untouchable - including
//     endpoints from a SUPERSEDED naming generation. The v4 -> v5 bump earlier that day orphaned a generation
//     that no live lane can ever use and no reclaim could ever free.
//  2. The endpoint list that names the quota holders was fetched and discarded, so the only way to ask
//     "what is holding the ten?" was to open the RunPod dashboard by hand.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MASS_DISTILLED_EXACT_ENDPOINT_GENERATION,
  appendQuotaInventory,
} from '../lib/ai/cos/runpodMassDistilledProvisionV2.ts'

const source = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')

const RUNPOD_QUOTA_TEXT = 'max workers across all endpoints must not exceed your workers quota'

test('the enriched error still classifies as infrastructure, so no student is charged for our quota', () => {
  // evaluatorInfrastructureFailure matches this literal RunPod text. If appending the inventory disturbed it,
  // a quota outage would be scored as model quality and consume one of the artifact's three attempts.
  const real = 'RunPod PATCH /serverless/pfdvibph6fon3a HTTP 400: Max workers across all endpoints must not '
    + 'exceed your workers quota (10). Reduce the max workers for other endpoints or lower the max worker '
    + 'count for this endpoint to at most 0.'
  const enriched = appendQuotaInventory(real, 'holders=10:reserved=10:itmounts-mass-distilled-abc-v5(1/1,protected)')
  assert.ok(enriched.toLowerCase().includes(RUNPOD_QUOTA_TEXT), 'the classifier fragment must survive untouched')
  assert.ok(enriched.startsWith(real), 'the original RunPod message must be preserved verbatim at the front')
  assert.ok(enriched.includes('quota_inventory='))

  const classifier = readFileSync(
    new URL('../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts', import.meta.url), 'utf8')
  assert.ok(classifier.includes(RUNPOD_QUOTA_TEXT), 'the classifier still matches on this exact fragment')
})

test('the inventory is appended once and stays bounded', () => {
  const once = appendQuotaInventory('boom', 'holders=1:reserved=1:a(1/1,pinned)')
  assert.equal(appendQuotaInventory(once, 'holders=99:reserved=99:b(1/1,pinned)'), once, 'never appended twice')
  const huge = appendQuotaInventory('boom', 'x'.repeat(5000))
  assert.ok(huge.length < 1200, `inventory must stay bounded, got ${huge.length}`)
  // An empty/garbage base must still produce a usable error rather than "undefined".
  assert.ok(appendQuotaInventory('', 'holders=0:reserved=0:').startsWith('mass_distilled_runtime_worker_quota_full'))
})

test('stale-generation endpoints are reclaimable even when pinned always-on', () => {
  // The predicate is keyed to the CURRENT generation constant, so the next bump cannot silently orphan
  // another generation the way v4 -> v5 did.
  assert.equal(MASS_DISTILLED_EXACT_ENDPOINT_GENERATION, 'v5')
  assert.match(source, /const staleGeneration = \(endpoint: Endpoint\) => \{/)
  assert.match(source, /return !name\.endsWith\(`-\$\{MASS_DISTILLED_EXACT_ENDPOINT_GENERATION\}`\)/)
  assert.match(source, /if \(!name\.startsWith\('itmounts-mass-distilled-'\)\) return false/)
  assert.match(
    source,
    /const reclaimable = unprotected\.filter\(endpoint =>\s*\n\s*Number\(endpoint\.workers\?\.min \?\? 0\) === 0 \|\| staleGeneration\(endpoint\)\)/,
  )
})

test('widening the reclaim did not weaken a single protection', () => {
  // Every skip that guarded the old filter must still guard the new one: the active endpoint, protected ids
  // (active graduates, evaluations, canaries), live Residency leases, and the primary. A stale generation is
  // only ever reclaimed AFTER all four have excluded it.
  const start = source.indexOf('const unprotected = (listed.endpoints || []).filter(endpoint =>')
  const end = source.indexOf('const reclaimable = unprotected.filter(endpoint =>')
  assert.ok(start > 0 && end > start)
  const guard = source.slice(start, end)
  for (const protection of [
    "clean(endpoint.id, 160) !== activeEndpointId",
    "!protectedEndpointIds.has(clean(endpoint.id, 160).toLowerCase())",
    "!protectedResidencyEndpointNames.has(clean(endpoint.name, 240))",
    "!RUNPOD_PRIMARY_ENDPOINT_NAMES.has(clean(endpoint.name, 240).toLowerCase())",
    "Number(endpoint.workers?.max ?? 0) > 0",
  ]) assert.ok(guard.includes(protection), `lost a protection: ${protection}`)

  // Reclaim still only ever drains to 0/0. It must never raise capacity anywhere.
  assert.match(source, /body: JSON\.stringify\(\{ workers: \{ min: 0, max: 0, idleTimeout \} \}\)/)
})

test('both throw paths carry the inventory, including the self-drain retry that produced the outage', () => {
  // The observed HTTP 400 came from the bare activate() after the self-drain, not from the recovery loop.
  // Instrumenting only the loop would have missed the exact failure this was built for.
  assert.match(source, /throw await withQuotaInventory\(lastError, activeEndpointId\)/)
  assert.match(source, /if \(!runpodWorkerQuotaError\(retryError\)\) throw retryError\s*\n\s*throw await withQuotaInventory\(retryError, String\(endpoint\.id\)\)/)
  // A non-quota error from that retry must propagate unchanged rather than being relabelled.
  assert.ok(source.includes('if (!runpodWorkerQuotaError(retryError)) throw retryError'))
})

test('the inventory explains why each holder survived, using the reclaim reasons themselves', () => {
  for (const reason of ["'active'", "'protected'", "'residency'", "'primary'", "'pinned'", "'reclaimable'"]) {
    assert.ok(source.includes(reason), `inventory must be able to report ${reason}`)
  }
  // Diagnostic only: it must not PATCH, delete, or otherwise change capacity.
  const start = source.indexOf('export async function runpodWorkerQuotaInventory(')
  const end = source.indexOf('export function appendQuotaInventory(')
  assert.ok(start > 0 && end > start)
  const body = source.slice(start, end)
  for (const mutation of ["method: 'PATCH'", "method: 'DELETE'", 'workers: {']) {
    assert.ok(!body.includes(mutation), `the inventory must not mutate anything, found ${mutation}`)
  }
})
