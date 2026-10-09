import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const code=readFileSync('lib/portable-products/cos-runtimes/selfHealingSupervisor.ts','utf8')
test('Supervisor exposes Lab health as read-only without changing existing repair authority',()=>{
 assert.match(code,/capabilityId: 'supervisor.inspect_lab_health'/)
 assert.match(code,/riskClass: 'read_only'/)
 assert.match(code,/capabilityId: 'supervisor.route_latest_failed_deployment'/)
 assert.match(code,/readTenantLabObservations\(db, tenant, revision\)/)
 assert.match(code,/\.eq\('tenant_id',tenant\)\.eq\('exact_revision',revision\)/)
 assert.match(code,/repairAuthorized:false/)
})
test('observing Lab health cannot diagnose or dispatch repairs',()=>{
 const start=code.indexOf('async function observeLabHealth()')
 const end=code.indexOf('function incidentFromObservation',start)
 const body=code.slice(start,end)
 assert.ok(start>0&&end>start)
 assert.doesNotMatch(body,/diagnoseIncident|dispatchRepairPlan|\.insert\(|\.update\(/)
 assert.match(body,/supervisor_lab_health_scope_unavailable/)
})
