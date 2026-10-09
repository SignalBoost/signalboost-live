// Disposable synthetic tenants only. This verifies governed dispatch isolation,
// not customer infrastructure, actual vault redemption, or production egress.
import assert from 'node:assert/strict'
import test from 'node:test'
import { dispatchBuyerOwnedProvider } from '../lib/ai/cos/labBuyerOwnedProviderDispatch.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'
import type { GovernedHarnessExecutor } from '../platform-harness/runtime/governed-executor.ts'

const tenants = [
 { org:'11111111-2222-4333-8444-555555555555', artifact:'aaaaaaaa-2222-4333-8444-555555555555', provider:'sandbox-a' },
 { org:'22222222-2222-4333-8444-555555555555', artifact:'bbbbbbbb-2222-4333-8444-555555555555', provider:'sandbox-b' },
] as const
const now=()=>new Date('2026-10-09T00:00:00Z')
const scopes=tenants.map(t=>({organizationId:t.org,permanentArtifactId:t.artifact,providerId:t.provider,capability:'teacher.invoke' as const}))
const grants=tenants.map(t=>({organization_id:t.org,permanent_artifact_id:t.artifact,provider_id:t.provider,capability:'teacher.invoke',secret_reference:`vault://${t.org}/sandbox`,expires_at:'2027-01-01T00:00:00Z',revoked_at:null}))
const manifests:HarnessManifest[]=tenants.map((t,i)=>({
 runId:`sandbox-run-${i}`,objective:'synthetic tenant boundary',profile:'production',
 identity:{agentId:'sandbox-agent',role:'worker',tenantId:t.org,artifact:{artifactId:t.artifact}},
 environment:{environmentId:'sandbox',class:'production'},authorityManifestRef:'synthetic-verified-fixture',
 capabilities:[{id:'teacher.invoke',mutating:true,risk:'consequential',scopes:[t.artifact,t.provider],environments:['production']}],
 limits:{},learningFeedbackAllowed:false,
}))

test('Phase 3 synthetic tenants: each can invoke only its own provider grant and artifact',async()=>{
 const invoked:string[]=[]
 const executor:GovernedHarnessExecutor={execute:async(manifest,action)=>{
   assert.equal(manifest.identity.tenantId,action.params?.secretReference?.toString().split('/')[2])
   invoked.push(manifest.identity.tenantId)
   return {actionId:action.actionId,capabilityId:action.capabilityId,status:'executed'}
 }}
 for(let i=0;i<2;i++) {
  const result=await dispatchBuyerOwnedProvider({
   scope:scopes[i],harnessRunId:manifests[i].runId,actionId:`synthetic-${i}`,now,
   readGrant:async()=>grants[i],resolveTrustedRun:async()=>({manifest:manifests[i],status:'active',authorityVerified:true}),executor,
  })
  assert.equal(result.status,'executed')
 }
 assert.deepEqual(invoked,tenants.map(t=>t.org))
})

test('Phase 3 synthetic tenants: swapping grant, signed run, or secret reference never executes',async()=>{
 let invocations=0
 const executor:GovernedHarnessExecutor={execute:async(_m,action)=>{
   invocations++
   return {actionId:action.actionId,capabilityId:action.capabilityId,status:'executed'}
 }}
 const scenarios=[
  {readGrant:async()=>grants[1],resolveTrustedRun:async()=>({manifest:manifests[0],status:'active' as const,authorityVerified:true})},
  {readGrant:async()=>grants[0],resolveTrustedRun:async()=>({manifest:manifests[1],status:'active' as const,authorityVerified:true})},
  {readGrant:async()=>({...grants[0],secret_reference:grants[1].secret_reference}),resolveTrustedRun:async()=>({manifest:manifests[0],status:'active' as const,authorityVerified:true})},
 ]
 for(const scenario of scenarios){
  const result=await dispatchBuyerOwnedProvider({scope:scopes[0],harnessRunId:manifests[0].runId,actionId:'no-cross-tenant-call',now,executor,...scenario})
  assert.notEqual(result.status,'executed')
 }
 assert.equal(invocations,0)
})
