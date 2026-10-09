import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const route=readFileSync('app/api/internal/lab-phase-observability/health/route.ts','utf8')
const resolver=readFileSync('lib/ai/cos/labMonitoringTenant.ts','utf8')
test('trusted health endpoint needs a full bearer secret before service-role access',()=>{
 assert.ok(route.indexOf("authorized(req.headers.get('authorization')")<route.indexOf('getAdminSupabase()'))
 assert.match(route,/timingSafeEqual/)
 assert.match(route,/secret.length<32/)
 assert.match(route,/resolveLabMonitoringTenant\(db\)/)
 assert.match(resolver,/ITMOUNTS_LAB_OBSERVABILITY_TENANT_ID/)
 assert.match(resolver,/itmounts_lab_observability_scope_valid/)
 assert.match(resolver,/itmounts_lab_observability_unique_tenant/)
 assert.doesNotMatch(route,/searchParams|request\.json\(/)
})
test('checks are read-only and refuse to claim supervisor delivery',()=>{
 assert.match(route,/dispatchLabHealthAlerts/)
 assert.match(route,/deliveredToExternalSupervisor:false/)
 assert.doesNotMatch(route,/\.insert\(|\.update\(|fetch\(/)
})
