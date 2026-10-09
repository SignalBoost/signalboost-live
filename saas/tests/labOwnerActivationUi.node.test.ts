import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const panel=readFileSync('app/dashboard/cos-university-telemetry/LabOwnerActivationPanel.tsx','utf8')
const page=readFileSync('app/dashboard/cos-university-telemetry/LabPhasesObservabilityPanel.tsx','utf8')
test('owner dashboard requires explicit organization name and affirmation',()=>{
 assert.match(panel,/confirmActivation:true/)
 assert.match(panel,/!confirmed\|\|!name\.trim\(\)/)
 assert.match(panel,/\/api\/admin\/lab-phase-observability\/provision/)
 assert.match(panel,/zero funded credits/)
})
test('activation only offered when readiness reports zero Lab organizations',()=>{
 assert.match(page,/readiness\?\.organizations===0/)
 assert.match(page,/<LabOwnerActivationPanel/)
})
