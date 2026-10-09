import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const sql=readFileSync('supabase/migrations/20261008234500_lab_phase_alert_outbox.sql','utf8')
const route=readFileSync('app/api/internal/lab-phase-observability/health/route.ts','utf8')
test('outbox is tenant scoped, RLS guarded and idempotent',()=>{
 assert.match(sql,/primary key \(tenant_id,exact_revision,phase,signal\)/)
 assert.match(sql,/enable row level security/)
 assert.match(sql,/revoke all on public.lab_phase_health_alerts from anon,authenticated/)
})
test('health check saves only advisory alert metadata and cannot claim external delivery',()=>{
 assert.match(route,/from\('lab_phase_health_alerts'\)/)
 assert.match(route,/deliveredToExternalSupervisor:false/)
 assert.doesNotMatch(route,/repairPlan|executeRepair/)
})
