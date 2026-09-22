import test from 'node:test'
import assert from 'node:assert/strict'
import { HARNESS_PROFILES, routeHarnessOutcome, validateHarnessRun } from '../platform-harness/index.ts'

const base = {
  runId:'run-1', objective:'repair controlled fixture', identity:{agentId:'builder',role:'software-specialist',artifactHash:'abc'},
  manifest:{profile:'residency' as const,authorityManifestRef:'signed:1',environmentId:'sandbox:1',production:false,capabilities:['github.read'],limits:{maxToolCalls:10,maxCostUsd:0.2,deadlineMs:60_000}},
}

test('canonical profiles are one shared harness surface',()=>{
  assert.deepEqual(HARNESS_PROFILES,['residency','production','sandbox','self_healing','security_lab','replay','evaluation_runtime'])
})

test('Residency cannot silently target Production',()=>{
  assert.deepEqual(validateHarnessRun({...base,manifest:{...base.manifest,production:true}}),{allowed:false,reason:'profile_production_environment_forbidden'})
  assert.deepEqual(validateHarnessRun(base),{allowed:true})
})

test('failure ownership remains separated',()=>{
  assert.equal(routeHarnessOutcome('infrastructure_failure'),'self_healing')
  assert.equal(routeHarnessOutcome('agent_failure'),'university_remediation')
  assert.equal(routeHarnessOutcome('authority_halt'),'referee_guardian')
  assert.equal(routeHarnessOutcome('harness_failure'),'harness_assurance')
})
