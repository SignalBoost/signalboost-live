import test from 'node:test'
import assert from 'node:assert/strict'
import { decideUniversityStationExecution } from '../lib/ai/cos/itmountsLabExperimentPausePolicy.ts'

const organizationId='11111111-1111-4111-8111-111111111111'
const experimentId='22222222-2222-4222-8222-222222222222'
const universityRunId='33333333-3333-4333-8333-333333333333'
const now=new Date('2026-10-07T12:00:00Z')
const authority={verifiedByHarness:true as const,organizationId,experimentId,universityRunId,expiresAt:'2026-10-07T13:00:00Z',capability:'university.distillation.execute' as const,authorityExpanded:false as const}
const explicit=(overrides:Record<string,unknown>={})=>decideUniversityStationExecution({paused:true,pauseKnown:true,invocation:'explicit_experiment',organizationId,experimentId,universityRunId,authority,now,...overrides})
test('paused scheduled intake stays paused, even with an experiment authority',()=>{
 assert.equal(decideUniversityStationExecution({paused:true,pauseKnown:true,invocation:'scheduled',authority,now}).allowed,false)
 assert.equal(decideUniversityStationExecution({paused:false,pauseKnown:true,invocation:'scheduled',now}).allowed,true)
})
test('explicit run may proceed while scheduled intake is paused',()=>assert.deepEqual(explicit(),{allowed:true,reason:'verified_explicit_experiment'}))
test('tenant, experiment and run cannot cross boundaries',()=>{
 for(const key of ['organizationId','experimentId','universityRunId']) assert.equal(explicit({[key]:'44444444-4444-4444-8444-444444444444'}).allowed,false)
})
test('missing, forged, expanded and expired authority fail closed',()=>{
 assert.equal(explicit({authority:null}).allowed,false)
 assert.equal(explicit({authority:{...authority,verifiedByHarness:false}}).allowed,false)
 assert.equal(explicit({authority:{...authority,authorityExpanded:true}}).allowed,false)
 assert.equal(explicit({authority:{...authority,expiresAt:'2026-10-07T11:00:00Z'}}).allowed,false)
 assert.equal(explicit({pauseKnown:false}).allowed,false)
})
