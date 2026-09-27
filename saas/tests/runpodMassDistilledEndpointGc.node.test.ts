import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const source=(p:string)=>fs.readFileSync(path.join(root,p),'utf8')

test('terminal endpoint GC is fail closed and bounded',()=>{
  const gc=source('lib/ai/cos/runpodMassDistilledEndpointGc.ts')
  assert.match(gc,/TERMINAL_ARTIFACT_STATUSES = new Set\(\['quarantined'\]\)/)
  assert.match(gc,/MAX_DELETIONS_PER_RUN = 20/)
  assert.match(gc,/contains\('evidence', \{ profile: PROFILE \}\)/)
  assert.match(gc,/\.in\('evidence->>endpointId', chunk\)/)
  assert.match(gc,/trained_artifact_hash,status/)
  assert.match(gc,/protectedRunpodEndpointIds\(\)/)
  assert.match(gc,/activeResidencyRunpodEndpointNames\(\)/)
  assert.match(gc,/protectedIds\.has\(id\)/)
  assert.match(gc,/protectedResidencyNames\.has\(name\)/)
  assert.match(gc,/Number\(endpoint\.workers\?\.min \?\? 0\) !== 0/)
  assert.match(gc,/Number\(endpoint\.workers\?\.max \?\? 0\) !== 0/)
  assert.match(gc,/terminal\.has\(/)
  assert.doesNotMatch(gc,/evaluation_pending.*TERMINAL_ARTIFACT_STATUSES/)
})

test('delete transport protects non-mass and worker-bearing endpoints',()=>{
  const provision=source('lib/ai/cos/runpodMassDistilledProvisionV2.ts')
  assert.match(provision,/runpod_endpoint_gc_not_mass_distilled/)
  assert.match(provision,/runpod_endpoint_gc_primary_protected/)
  assert.match(provision,/runpod_endpoint_gc_worker_reservation_present/)
  assert.match(provision,/\/endpoints\/\$\{encodeURIComponent\(id\)\}/)
  assert.match(provision,/method: 'DELETE'/)
})

test('GC is cron-secret protected and operationally observable',()=>{
  const route=source('app/api/cron/runpod-terminal-endpoint-gc/route.ts')
  assert.match(route,/process\.env\.CRON_SECRET/)
  assert.match(route,/garbageCollectTerminalMassDistilledEndpoints\(\)/)
  assert.match(route,/runpod-terminal-endpoint-gc/)
  assert.match(route,/terminal_endpoints_deleted/)
  assert.match(route,/endpoint_gc_failed/)
})
