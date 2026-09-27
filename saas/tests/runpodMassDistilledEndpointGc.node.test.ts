import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

test('terminal endpoint GC is DB-first, quarantined-only, protected and bounded', () => {
  const gc = source('lib/ai/cos/runpodMassDistilledEndpointGc.ts')
  assert.ok(gc.includes(".eq('status', 'quarantined')"))
  assert.ok(gc.includes('MAX_DELETIONS_PER_RUN = 20'))
  assert.ok(gc.includes(".contains('evidence', { profile: PROFILE })"))
  assert.ok(gc.includes(".in('candidate_id', chunk)"))
  assert.ok(gc.includes('protectedRunpodEndpointIds()'))
  assert.ok(gc.includes('activeResidencyRunpodEndpointNames()'))
  assert.ok(gc.includes('terminalKeys.has('))
  assert.ok(!gc.includes('listMassDistilledRunpodEndpoints'))
  assert.ok(!gc.includes(".eq('status', 'evaluation_pending')"))
})

test('retirement evidence advances later cleanup runs past deleted and 404 endpoints', () => {
  const gc = source('lib/ai/cos/runpodMassDistilledEndpointGc.ts')
  assert.ok(gc.includes('endpointRetired === true'))
  assert.ok(gc.includes("createHash('sha256')"))
  assert.ok(gc.includes(".digest('hex')"))
  assert.ok(gc.includes('retiredEndpointIds.add(endpointId)'))
  assert.ok(gc.includes('retiredEndpointIds.has(endpointId)'))
  assert.ok(gc.includes("claim: 'local_distilled_runtime_endpoint_retired'"))
  assert.ok(gc.includes("reason: 'deleted' | 'already_gone'"))
  assert.ok(gc.includes("recordRetired(endpointId, owner, 'deleted')"))
  assert.ok(gc.includes("recordRetired(endpointId, owner, 'already_gone')"))
})

test('delete transport uses individual lookup and protects non-mass and worker-bearing endpoints', () => {
  const provision = source('lib/ai/cos/runpodMassDistilledProvisionV2.ts')
  assert.ok(provision.includes('requestV2<Endpoint>(`/serverless/${encodeURIComponent(id)}`)'))
  assert.ok(provision.includes('runpod_endpoint_gc_not_mass_distilled'))
  assert.ok(provision.includes('runpod_endpoint_gc_primary_protected'))
  assert.ok(provision.includes('runpod_endpoint_gc_worker_reservation_present'))
  assert.ok(provision.includes("method: 'DELETE'"))
})

test('cron reports partial deletion failure as failure for SHS/observability', () => {
  const route = source('app/api/cron/runpod-terminal-endpoint-gc/route.ts')
  assert.ok(route.includes('result.failed > 0'))
  assert.ok(route.includes("outcome: 'failed'"))
  assert.ok(route.includes("reason: 'endpoint_deletions_failed'"))
  assert.ok(route.includes('status: 503'))
  assert.ok(route.includes('terminal_endpoints_reconciled'))
})
