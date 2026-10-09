import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const config=JSON.parse(readFileSync('vercel.json','utf8'))
const route=readFileSync('app/api/internal/lab-phase-observability/health/route.ts','utf8')
test('hourly health cron targets the authenticated and read-only endpoint',()=>{
 const rows=config.crons.filter((x:{path:string})=>x.path==='/api/internal/lab-phase-observability/health')
 assert.equal(rows.length,1)
 assert.equal(rows[0].schedule,'17 * * * *')
 assert.match(route,/process\.env\.CRON_SECRET/)
 assert.match(route,/timingSafeEqual/)
})
test('telemetry alerts remain aggregate, never claim external Supervisor delivery',()=>{
 assert.match(route,/\[lab_phase_observability_health_alerts\]/)
 assert.match(route,/deliveredToExternalSupervisor:false/)
 assert.doesNotMatch(route,/console\.warn\([^\n]*tenant/)
})
