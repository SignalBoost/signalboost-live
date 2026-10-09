import test from 'node:test'
import assert from 'node:assert/strict'
import {platformSupervisorRepairAuthorized} from '../agent-gateway-host/supervisor-repair.ts'
const env={VERCEL_PROJECT_ID:'prj_platform123'}
test('Supervisor accepts only exact platform-owned deployment identity',()=>{
 assert.equal(platformSupervisorRepairAuthorized({incident_id:'p',project:'prj_platform123',provider:'Vercel'},env),true)
 assert.equal(platformSupervisorRepairAuthorized({incident_id:'c',project:'prj_customer',provider:'Vercel'},env),false)
 assert.equal(platformSupervisorRepairAuthorized({incident_id:'c',project:'prj_platform123',provider:'AWS'},env),false)
 assert.equal(platformSupervisorRepairAuthorized({incident_id:'c',project:'prj_platform123',provider:'Supabase'},env),false)
 assert.equal(platformSupervisorRepairAuthorized({incident_id:'c',project:'prj_platform123',provider:'Vercel'},{VERCEL_PROJECT_ID:''}),false)
 assert.equal(platformSupervisorRepairAuthorized({incident_id:'c',project:'prj_platform123',provider:'Vercel'},{VERCEL_PROJECT_ID:'prj_customer'}),false)
})
