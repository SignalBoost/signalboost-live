// saas/tests/runpodEndpointDirectLookup.node.test.ts
//
// Production 2026-09-28 22:15-22:31 UTC: every exam that started died on "RunPod GET /serverless HTTP 500: failed
// to list endpoints". The exam path listed every endpoint on the account (~860 never-retired mass endpoints) to find
// the one whose id it already had. It now reads that single endpoint directly, like the endpoint GC already does.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
const resolver = source.slice(source.indexOf('async function resolveEndpointControlPlane'), source.indexOf('async function constrainEndpointToApprovedGpu'))

test('a known endpoint id is read directly before any account-wide listing', () => {
  const direct = resolver.indexOf('requestV2<Endpoint>(`/serverless/${encodeURIComponent(observedId)}`)')
  const listing = resolver.indexOf("requestV2<{ endpoints?: Endpoint[] }>('/serverless')")
  assert.ok(direct > 0, 'direct single-endpoint read is present')
  assert.ok(listing > direct, 'the account-wide list is only a fallback after the direct read')
  assert.match(resolver, /if \(observedId\) \{/)
  // The direct result must be the exact endpoint asked for.
  assert.match(resolver, /clean\(direct\.id, 160\)\.toLowerCase\(\) === observedId\.toLowerCase\(\)/)
})

test('the exam wake, shutdown and GPU check all go through the direct-first resolver', () => {
  for (const fn of ['export async function activateMassDistilledEvaluationWorker', 'export async function deactivateMassDistilledEvaluationWorker', 'async function constrainEndpointToApprovedGpu']) {
    const start = source.indexOf(fn)
    assert.ok(start > 0, fn)
    assert.match(source.slice(start, start + 800), /resolveEndpointControlPlane\(/)
  }
})
