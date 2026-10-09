import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const route=readFileSync('app/api/lab/experiments/route.ts','utf8')
test('live phase 1 telemetry only follows an authorized successful start',()=>{
 assert.ok(route.indexOf('withCustomerLabUniversityBindingHarness')<route.indexOf('if (result.ok)'))
 assert.ok(route.indexOf('if (result.ok)')<route.indexOf("service.from('lab_phase_observations')"))
 assert.match(route,/source: 'live_runtime', outcome: 'started'/)
 assert.match(route,/tenant_id: organizationId/)
 assert.match(route,/VERCEL_GIT_COMMIT_SHA/)
 assert.doesNotMatch(route,/outcome: 'passed'/)
})
test('failed telemetry export does not retry, refund, or undo the already accepted experiment',()=>{
 assert.match(route,/\[lab_phase_observation_delivery_failed\]/)
 assert.match(route,/catch \{/)
 assert.match(route,/return NextResponse\.json\(result, \{ status: result\.ok \? 200 : 409 \}\)/)
})
