import assert from 'node:assert/strict'
import test from 'node:test'
import { auditBirthWithTrustedHarness, BIRTH_AUDIT_CAPABILITY } from '../lib/ai/cos/universityHarnessBoundBirthAudit.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'
const id='f2cb6434-a7ac-49ee-88f0-34a94f31a422'
const context={tenantId:'tenant-a',harnessRunId:'run-a',permanentArtifactId:id}
const manifest:HarnessManifest={runId:'run-a',objective:'audit birth',profile:'production',identity:{agentId:'auditor',role:'auditor',tenantId:'tenant-a',artifact:{artifactId:id}},environment:{environmentId:'audit',class:'production'},authorityManifestRef:'verified',capabilities:[{id:BIRTH_AUDIT_CAPABILITY,mutating:false,risk:'read',environments:['production'],scopes:[id]}],limits:{},learningFeedbackAllowed:false}
function fixture(man:HarnessManifest=manifest,status:'active'|'completed'='active'){
 let reads=0,checks=0
 const input={context,trustedIssuerFingerprint:'0'.repeat(64),resolveTrustedRun:async()=>{checks++;return {manifest:man,status,authorityVerified:true}},source:{readBirth:async()=>{reads++;return null},readSignedEnvelope:async()=>{reads++;return null}}}
 return {input,stats:()=>({reads,checks})}
}
test('read-scoped active Harness authorizes three checks and two tenant-filtered reads',async()=>{
 const f=fixture()
 assert.equal(await auditBirthWithTrustedHarness(f.input),'missing_birth')
 assert.deepEqual(f.stats(),{reads:2,checks:3})
})
test('signing authority is not interchangeable with audit authority',async()=>{
 const f=fixture({...manifest,capabilities:[{id:'university.artifact.birth.sign',mutating:true,risk:'consequential',environments:['production'],scopes:[id]}]})
 assert.equal(await auditBirthWithTrustedHarness(f.input),'not_authorized')
 assert.equal(f.stats().reads,0)
})
test('cross-tenant, wrong artifact, stale run, and insufficient read scope deny all reads',async()=>{
 for(const m of [
  {...manifest,identity:{...manifest.identity,tenantId:'tenant-b'}},
  {...manifest,identity:{...manifest.identity,artifact:{artifactId:'other'}}},
  {...manifest,capabilities:[{...manifest.capabilities[0],scopes:['other']}]},
  {...manifest,capabilities:[{...manifest.capabilities[0],risk:'write' as const}]},
 ]){const f=fixture(m);assert.equal(await auditBirthWithTrustedHarness(f.input),'not_authorized');assert.equal(f.stats().reads,0)}
 const completed=fixture(manifest,'completed')
 assert.equal(await auditBirthWithTrustedHarness(completed.input),'not_authorized')
 assert.equal(completed.stats().reads,0)
})
test('revoked authority between record reads prevents second read',async()=>{
 let calls=0,reads=0
 const f=fixture()
 const result=await auditBirthWithTrustedHarness({...f.input,resolveTrustedRun:async()=>{calls++;return {manifest,status:calls===1?'active' as const:'cancelled' as const,authorityVerified:true}},source:{readBirth:async()=>{reads++;return null},readSignedEnvelope:async()=>{reads++;return null}}})
 assert.equal(result,'not_authorized')
 assert.equal(reads,1)
})
