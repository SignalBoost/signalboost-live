import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const provision = readFileSync(new URL('../lib/ai/cos/runpodServerlessDistilledProvision.ts', import.meta.url), 'utf8')

test('distilled canary reconciliation verifies existing endpoint without mutating it', () => {
  const start = provision.indexOf('export async function reconcileRunpodServerlessDistilledEndpoint')
  const end = provision.indexOf('export async function provisionRunpodServerlessDistilledLlm')
  assert.ok(start >= 0 && end > start)
  const reconcile = provision.slice(start, end)
  assert.match(reconcile, /requestV2<\{ endpoints\?: RunpodEndpointV2\[] \}>\('\/serverless'\)/)
  assert.match(reconcile, /find\(item => item\.id === id\)/)
  assert.match(reconcile, /assertDistilledEndpointPolicy\(endpoint, id\)/)
  assert.doesNotMatch(reconcile, /method:\s*'PATCH'/)
  assert.doesNotMatch(reconcile, /JSON\.stringify\(endpointV2PolicyPayload\(\)\)/)
})

test('read-only reconciliation fails closed on policy drift', () => {
  assert.match(provision, /workersMin !== 0/)
  assert.match(provision, /workersMax > 1/)
  assert.match(provision, /idleTimeout > DISTILLED_IDLE_TIMEOUT_SECONDS/)
  assert.match(provision, /endpoint\.scaling\?\.type && endpoint\.scaling\.type !== 'REQUEST_COUNT'/)
  assert.match(provision, /endpoint\.gpu\?\.count !== undefined && Number\(endpoint\.gpu\.count\) !== 1/)
  assert.match(provision, /RunPod distilled endpoint is no longer present in the account/)
})
