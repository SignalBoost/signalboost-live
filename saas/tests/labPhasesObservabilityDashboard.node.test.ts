import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
const page=readFileSync('app/dashboard/cos-university-telemetry/page.tsx','utf8')
const panel=readFileSync('app/dashboard/cos-university-telemetry/LabPhasesObservabilityPanel.tsx','utf8')
test('University dashboard mounts owner-only phase health panel',()=>{
 assert.match(page,/import LabPhasesObservabilityPanel/)
 assert.match(page,/<LabPhasesObservabilityPanel\s*\/>/)
})
test('panel is read-only, fails visibly closed and does not claim certification',()=>{
 assert.match(panel,/fetch\('\/api\/admin\/lab-phase-observability'/)
 assert.match(panel,/NOT CERTIFIED/)
 assert.match(panel,/no health status can be confirmed/)
 assert.doesNotMatch(panel,/method:\s*'POST'/)
 assert.doesNotMatch(panel,/productionAuthorized\s*=\s*true/)
})
