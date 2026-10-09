import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const route=readFileSync('app/api/internal/lab-phase-observability/alerts/route.ts','utf8')
test('Supervisor poll feed authenticates before service-role read and pins tenant and revision',()=>{
 assert.ok(route.indexOf('if(!authenticated(req))')<route.indexOf('getAdminSupabase()'))
 assert.match(route,/timingSafeEqual/)
 assert.match(route,/ITMOUNTS_LAB_OBSERVABILITY_TENANT_ID/)
 assert.match(route,/\.eq\('tenant_id',tenant\)\.eq\('exact_revision',revision\)/)
 assert.doesNotMatch(route,/searchParams/)
})
test('Supervisor feed is bounded, read-only, and never signals recovery authorization',()=>{
 assert.match(route,/\.limit\(15\)/)
 assert.match(route,/supervisorActionAuthorized:false,deliveredToSupervisor:false/)
 assert.doesNotMatch(route,/\.insert\(|\.upsert\(|\.update\(|\.delete\(|invoke\(|recover\(/)
})
