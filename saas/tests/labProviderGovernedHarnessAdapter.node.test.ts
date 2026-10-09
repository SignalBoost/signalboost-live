import assert from 'node:assert/strict'
import test from 'node:test'
import { executeProviderViaHarness } from '../lib/ai/cos/labProviderGovernedHarnessAdapter.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'
import type { GovernedHarnessExecutor } from '../platform-harness/runtime/governed-executor.ts'
const org='11111111-2222-4333-8444-555555555555'
const artifact='22222222-3333-4444-8555-666666666666'
const scope={organizationId:org,permanentArtifactId:artifact,providerId:'provider-a',capability:'teacher.invoke' as const}
const manifest:HarnessManifest={runId:'run-1',objective:'provider invocation',profile:'production',identity:{agentId:'worker',role:'worker',tenantId:org,artifact:{artifactId:artifact}},environment:{environmentId:'production',class:'production'},authorityManifestRef:'host-verified',capabilities:[{id:'teacher.invoke',mutating:true,risk:'consequential',scopes:[artifact,'provider-a'],environments:['production']}],limits:{},learningFeedbackAllowed:false}
const secretReference=`vault://${org}/teacher`
function setup(m:HarnessManifest=manifest,status:'active'|'cancelled'='active') {
 let calls=0,received:unknown=null
 const executor:GovernedHarnessExecutor={execute:async (_manifest,action)=>{calls++;received={manifest:_manifest,action};return {actionId:action.actionId,capabilityId:action.capabilityId,status:'authority_boundary'}}}
 const input={scope,harnessRunId:'run-1',secretReference,actionId:'provider-call-1',executor,resolveTrustedRun:async()=>({manifest:m,status,authorityVerified:true})}
 return {input,stats:()=>({calls,received})}
}
test('Phase 3: only actual governed executor is called and its denial is preserved',async()=>{
 const s=setup()
 const result=await executeProviderViaHarness(s.input)
 assert.equal(result?.status,'authority_boundary')
 assert.equal(s.stats().calls,1)
 const record=s.stats().received as {action:{capabilityId:string;kind:string;params:{secretReference:string};compensation:{mode:string}}}
 assert.equal(record.action.capabilityId,'teacher.invoke')
 assert.equal(record.action.kind,'provider.invoke')
 assert.equal(record.action.params.secretReference,secretReference)
 assert.equal(record.action.compensation.mode,'irreversible')
})
test('Phase 3: cancelled, wrong tenant, wrong artifact and wrong provider capability never reach socket',async()=>{
 for(const s of [
 setup(manifest,'cancelled'),
 setup({...manifest,identity:{...manifest.identity,tenantId:'another'}}),
 setup({...manifest,identity:{...manifest.identity,artifact:{artifactId:'other'}}}),
 setup({...manifest,capabilities:[{...manifest.capabilities[0],scopes:[artifact]}]}),
 setup({...manifest,profile:'staging'}),
 ]) {
 assert.equal(await executeProviderViaHarness(s.input),null)
 assert.equal(s.stats().calls,0)
 }
})
test('Phase 3: malformed missing run and action identifiers fail closed',async()=>{
 const s=setup()
 assert.equal(await executeProviderViaHarness({...s.input,actionId:''}),null)
 assert.equal(await executeProviderViaHarness({...s.input,harnessRunId:''}),null)
 assert.equal(s.stats().calls,0)
})


test('Phase 3: async trusted-run lookup cannot redirect tenant, artifact or provider dispatch',async()=>{
 const s=setup()
 let calls=0
 const input={...s.input,scope:{...scope},executor:{execute:async(_m,action)=>{
  calls++
  assert.equal(_m.identity.tenantId,org)
  assert.equal(action.params.providerId,'provider-a')
  assert.equal(action.params.permanentArtifactId,artifact)
  assert.equal(action.params.secretReference,secretReference)
  assert.equal(action.actionId,'provider-call-1')
  return {actionId:action.actionId,capabilityId:action.capabilityId,status:'authority_boundary' as const}
 }},resolveTrustedRun:async()=>{
  input.scope.organizationId='forged-org'
  input.scope.permanentArtifactId='forged-artifact'
  input.scope.providerId='forged-provider'
  input.actionId='forged-action'
  input.secretReference='vault://forged-org/secret'
  input.executor={execute:async()=>{throw Error('swapped executor ran')}}
  return {manifest,status:'active' as const,authorityVerified:true}
 }}
 const result=await executeProviderViaHarness(input)
 assert.equal(result?.status,'authority_boundary')
 assert.equal(calls,1)
})
