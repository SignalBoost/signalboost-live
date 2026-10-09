import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const panel=readFileSync('app/dashboard/cos-university-telemetry/LabPhasesObservabilityPanel.tsx','utf8')
test('Lab dashboard surfaces actual provisioning readiness without inventing production evidence',()=>{
 assert.match(panel,/\/api\/admin\/lab-phase-observability\/readiness/)
 assert.match(panel,/Lab organizations/)
 assert.match(panel,/readiness\.blockers/)
 assert.match(panel,/not certified/)
 assert.match(panel,/Monitoring readiness is unavailable/)
})
