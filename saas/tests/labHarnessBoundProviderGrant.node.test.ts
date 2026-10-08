import assert from 'node:assert/strict'
import test from 'node:test'
import { authorizeTenantProviderPreflight } from '../lib/ai/cos/labHarnessBoundProviderGrant.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'
const org='11111111-2222-4333-8444-555555555555'
const artifact='22222222-3333-4444-8555-666666666666'
const scope={organizationId:org,permanentArtifactId:artifact,providerId:'provider-a',capability:'teacher.invoke' as const}
const now=new Date('2026-10-08T12:00:00Z')
const grant={organization_id:org,permanent_artifact_id:artifact,provider_id:'provider-a',capability:'teacher.invoke',secret_reference:`vault://${org}/teacher`,expires_at:'2027-01-01T00:00:00Z',revoked_at:null}
const manifest:HarnessManifest={runId:'run-1',objective:'provider use',profile:'production',identity:{agentId:'worker',role:'worker',tenantId:org,artifact:{artifactId:artifact}},environment:{environmentId:'tenant-runtime',class:'production'},authorityManifestRef:'signed-referee',capabilities:[{id:'teacher.invoke',mutating:true,risk:'consequential',environments:['production'],scopes:[artifact,'provider-a']}],limits:{},learningFeedbackAllowed:false}
function setup(status:'active'|'cancelled'='active') {
 let reads=0,checks=0
 const input={scope,harnessRunId:'run-1',now,resolveTrustedRun:async()=>{checks++;return {manifest,status,authorityVerified:true}},readGrant:async()=>{reads++;return grant}}
 return {input,stats:()=>({reads,checks})}
}
test('Phase 3 exact live tenant, artifact, provider and capability allow scoped preflight',async()=>{
 const s=setup();assert.deepEqual(await authorizeTenantProviderPreflight(s.input),{allowed:true,secretReference:grant.secret_reference});assert.deepEqual(s.stats(),{reads:1,checks:2})
})
test('Phase 3 completed or cancelled run never reads credential metadata',async()=>{
 const s=setup('cancelled');assert.equal((await authorizeTenantProviderPreflight(s.input)).allowed,false);assert.equal(s.stats().reads,0)
})
test('Phase 3 tenant, artifact, provider and consequential permission cannot be substituted',async()=>{
 for(const m of [
 {...manifest,identity:{...manifest.identity,tenantId:'other'}},
 {...manifest,identity:{...manifest.identity,artifact:{artifactId:'other'}}},
 {...manifest,capabilities:[{...manifest.capabilities[0],risk:'read' as const}]},
 {...manifest,capabilities:[{...manifest.capabilities[0],scopes:[artifact]}]},
 ]){const s=setup();const result=await authorizeTenantProviderPreflight({...s.input,resolveTrustedRun:async()=>({manifest:m,status:'active',authorityVerified:true})});assert.equal(result.allowed,false);assert.equal(s.stats().reads,0)}
})
test('Phase 3 grant revoked while it is fetched blocks credential reference release',async()=>{
 const s=setup();let count=0
 const result=await authorizeTenantProviderPreflight({...s.input,resolveTrustedRun:async()=>({manifest,status:++count===1?'active' as const:'cancelled' as const,authorityVerified:true})})
 assert.equal(result.allowed,false);assert.equal(s.stats().reads,1)
})
test('Phase 3 expired or wrong-tenant grant fails even with active Harness authority',async()=>{
 const s=setup()
 for(const g of [{...grant,revoked_at:'2026-10-08T01:00:00Z'},{...grant,organization_id:'other'}, {...grant,expires_at:'2020-01-01T00:00:00Z'}]){
 const result=await authorizeTenantProviderPreflight({...s.input,readGrant:async()=>g});assert.equal(result.allowed,false)
 }
})
