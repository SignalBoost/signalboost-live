import assert from 'node:assert/strict'
import test from 'node:test'
import { dispatchBuyerOwnedProvider } from '../lib/ai/cos/labBuyerOwnedProviderDispatch.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'
import type { GovernedHarnessExecutor } from '../platform-harness/runtime/governed-executor.ts'
const org='11111111-2222-4333-8444-555555555555'
const artifact='22222222-3333-4444-8555-666666666666'
const scope={organizationId:org,permanentArtifactId:artifact,providerId:'provider-a',capability:'teacher.invoke' as const}
const grant={organization_id:org,permanent_artifact_id:artifact,provider_id:'provider-a',capability:'teacher.invoke',secret_reference:`vault://${org}/teacher`,expires_at:'2027-01-01T00:00:00Z',revoked_at:null}
const manifest:HarnessManifest={runId:'run-1',objective:'provider invocation',profile:'production',identity:{agentId:'worker',role:'worker',tenantId:org,artifact:{artifactId:artifact}},environment:{environmentId:'production',class:'production'},authorityManifestRef:'verified',capabilities:[{id:'teacher.invoke',mutating:true,risk:'consequential',scopes:[artifact,'provider-a'],environments:['production']}],limits:{},learningFeedbackAllowed:false}
function setup() {
 let reads=0,checks=0,executions=0
 const executor:GovernedHarnessExecutor={execute:async (_m,action)=>{executions++;return {actionId:action.actionId,capabilityId:action.capabilityId,status:'executed'}}}
 const input={scope,harnessRunId:'run-1',actionId:'call-1',now:()=>new Date('2026-10-08T12:00:00Z'),readGrant:async()=>{reads++;return grant},resolveTrustedRun:async()=>{checks++;return {manifest,status:'active' as const,authorityVerified:true}},executor}
 return {input,stats:()=>({reads,checks,executions})}
}
test('Phase 3: authorized grant invokes governed executor exactly once',async()=>{
 const s=setup()
 const outcome=await dispatchBuyerOwnedProvider(s.input)
 assert.equal(outcome.status,'executed')
 assert.deepEqual(s.stats(),{reads:2,checks:5,executions:1})
})
test('Phase 3: wrong-tenant grant does not invoke governed executor',async()=>{
 const s=setup()
 const result=await dispatchBuyerOwnedProvider({...s.input,readGrant:async()=>({...grant,organization_id:'other'})})
 assert.equal(result.status,'denied')
 assert.equal(s.stats().executions,0)
})
test('Phase 3: revoked Harness on final resolution never invokes socket',async()=>{
 const s=setup();let checks=0
 const result=await dispatchBuyerOwnedProvider({...s.input,resolveTrustedRun:async()=>({manifest,status:++checks<=4?'active' as const:'cancelled' as const,authorityVerified:true})})
 assert.equal(result.status,'execution_failed')
 assert.equal(s.stats().executions,0)
})
test('Phase 3: governed socket authority boundary is not reported as success',async()=>{
 const s=setup()
 const executor:GovernedHarnessExecutor={execute:async(_m,action)=>({actionId:action.actionId,capabilityId:action.capabilityId,status:'authority_boundary'})}
 const result=await dispatchBuyerOwnedProvider({...s.input,executor})
 assert.equal(result.status,'execution_failed')
})
test('Phase 3: changed vault path between grant reads blocks execution',async()=>{
 const s=setup();let reads=0
 const result=await dispatchBuyerOwnedProvider({...s.input,readGrant:async()=>++reads===1?grant:{...grant,secret_reference:`vault://${org}/other`}})
 assert.equal(result.status,'denied')
 assert.equal(s.stats().executions,0)
})

test('Phase 3: async grant callback cannot retarget the governed action ID',async()=>{
 const s=setup()
 const observed:string[]=[]
 const input: typeof s.input={
  ...s.input,
  readGrant:async()=>{input.actionId='injected-action';return grant},
  executor:{execute:async(_m,action)=>{
   observed.push(action.actionId)
   return {actionId:action.actionId,capabilityId:action.capabilityId,status:'executed'}
  }},
 }
 const result=await dispatchBuyerOwnedProvider(input)
 assert.equal(result.status,'executed')
 assert.deepEqual(observed,['call-1'])
})
test('Phase 3: invalid action ID fails closed before any grant or Harness reads',async()=>{
 const s=setup()
 const result=await dispatchBuyerOwnedProvider({...s.input,actionId:'  '})
 assert.equal(result.status,'denied')
 assert.deepEqual(s.stats(),{reads:0,checks:0,executions:0})
})
