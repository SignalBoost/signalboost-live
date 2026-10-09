import assert from 'node:assert/strict'
import test from 'node:test'
import { executeTenantProviderGoverned } from '../lib/ai/cos/labGovernedProviderExecution.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'
const org='11111111-2222-4333-8444-555555555555'
const artifact='22222222-3333-4444-8555-666666666666'
const scope={organizationId:org,permanentArtifactId:artifact,providerId:'provider-a',capability:'teacher.invoke' as const}
const manifest:HarnessManifest={runId:'run-1',objective:'provider work',profile:'production',identity:{agentId:'worker',role:'worker',tenantId:org,artifact:{artifactId:artifact}},environment:{environmentId:'prod',class:'production'},authorityManifestRef:'signed-referee',capabilities:[{id:'teacher.invoke',mutating:true,risk:'consequential',environments:['production'],scopes:[artifact,'provider-a']}],limits:{},learningFeedbackAllowed:false}
const grant={organization_id:org,permanent_artifact_id:artifact,provider_id:'provider-a',capability:'teacher.invoke',secret_reference:`vault://${org}/teacher`,expires_at:'2027-01-01T00:00:00Z',revoked_at:null}
function setup() {
 let calls=0,reads=0,executions=0
 const input={scope,harnessRunId:'run-1',now:()=>new Date('2026-10-08T12:00:00Z'),resolveTrustedRun:async()=>{calls++;return {manifest,status:'active' as const,authorityVerified:true}},readGrant:async()=>{reads++;return grant},executeGoverned:async()=>{executions++;return 'ok'}}
 return {input,stats:()=>({calls,reads,executions})}
}
test('Phase 3 fresh double-preflight passes only opaque reference to governed executor',async()=>{
 const s=setup()
 assert.deepEqual(await executeTenantProviderGoverned(s.input),{status:'executed',value:'ok'})
 assert.deepEqual(s.stats(),{calls:4,reads:2,executions:1})
})
test('Phase 3 grant revoked between approval and execution prevents provider invocation',async()=>{
 const s=setup();let reads=0
 const result=await executeTenantProviderGoverned({...s.input,readGrant:async()=>++reads===1?grant:{...grant,revoked_at:'2026-10-08T11:00:00Z'}})
 assert.equal(result.status,'denied');assert.equal(s.stats().executions,0)
})
test('Phase 3 Harness revocation after first preflight blocks provider call',async()=>{
 const s=setup();let checks=0
 const result=await executeTenantProviderGoverned({...s.input,resolveTrustedRun:async()=>({manifest,status:++checks<=2?'active' as const:'cancelled' as const,authorityVerified:true})})
 assert.equal(result.status,'denied');assert.equal(s.stats().executions,0)
})
test('Phase 3 vault reference substitution after approval is denied',async()=>{
 const s=setup();let reads=0
 const result=await executeTenantProviderGoverned({...s.input,readGrant:async()=>++reads===1?grant:{...grant,secret_reference:`vault://${org}/other`}})
 assert.equal(result.status,'denied');assert.equal(s.stats().executions,0)
})

test('Phase 3 caller cannot retarget tenant or provider during asynchronous grant lookup',async()=>{
 const s=setup()
 const mutableScope={...scope}
 const seen: string[]=[]
 const result=await executeTenantProviderGoverned({
   ...s.input,
   scope:mutableScope,
   readGrant:async received=>{
     assert.equal(Object.isFrozen(received),true)
     seen.push(received.organizationId+':'+received.providerId)
     mutableScope.organizationId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
     mutableScope.providerId='provider-b'
     return grant
   },
   executeGoverned:async args=>{
     assert.equal(args.scope.organizationId,org)
     assert.equal(args.scope.providerId,'provider-a')
     assert.equal(Object.isFrozen(args.scope),true)
     seen.push(args.scope.organizationId+':'+args.scope.providerId)
     return 'ok'
   },
 })
 assert.deepEqual(result,{status:'executed',value:'ok'})
 assert.deepEqual(seen,Array(3).fill(org+':provider-a'))
})

test('Phase 3 host callback replacement during grant lookup cannot replace execution',async()=>{
 const s=setup()
 let hijacked=0
 const input={...s.input}
 input.readGrant=async()=>{
  input.executeGoverned=async()=>{hijacked++;return 'hijacked'}
  input.resolveTrustedRun=async()=>null as never
  input.now=()=>new Date('2030-01-01T00:00:00Z')
  return grant
 }
 const result=await executeTenantProviderGoverned(input)
 assert.deepEqual(result,{status:'executed',value:'ok'})
 assert.equal(hijacked,0)
 assert.equal(s.stats().executions,1)
})
