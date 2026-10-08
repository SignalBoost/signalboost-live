import assert from 'node:assert/strict'
import test from 'node:test'
import { auditBirthAgainstTenantDatabase } from '../lib/ai/cos/universityTenantDatabaseBirthAudit.ts'
import { BIRTH_AUDIT_CAPABILITY } from '../lib/ai/cos/universityHarnessBoundBirthAudit.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'
const tenant='11111111-2222-4333-8444-555555555555'
const artifact='f2cb6434-a7ac-49ee-88f0-34a94f31a422'
const context={tenantId:tenant,permanentArtifactId:artifact,harnessRunId:'run-1'}
const manifest:HarnessManifest={
 runId:'run-1',objective:'artifact audit',profile:'production',
 identity:{agentId:'audit',role:'auditor',tenantId:tenant,artifact:{artifactId:artifact}},
 environment:{environmentId:'prod',class:'production'},authorityManifestRef:'trusted',
 capabilities:[{id:BIRTH_AUDIT_CAPABILITY,mutating:false,risk:'read',scopes:[artifact],environments:['production']}],
 limits:{},learningFeedbackAllowed:false,
}
function fixture(owner:string=tenant){
 const reads:string[]=[]
 function query(table:string){
  const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>{reads.push(table);return {error:null,data:table==='lab.artifacts'?{permanent_artifact_id:artifact,organization_id:owner}:null}}}
  return q
 }
 const serviceDb={schema:(s:string)=>({from:(t:string)=>query(s+'.'+t)}),from:(t:string)=>query('public.'+t)}
 const input={context,authenticatedTenantId:tenant,serviceDb,trustedIssuerFingerprint:'0'.repeat(64),
  resolveTrustedRun:async()=>({manifest,status:'active' as const,authorityVerified:true})}
 return {input,reads}
}
test('Phase 2: matching host tenant and active read Harness allow only owned DB access',async()=>{
 const f=fixture()
 assert.equal(await auditBirthAgainstTenantDatabase(f.input),'missing_birth')
 assert.deepEqual(f.reads,['lab.artifacts','public.cos_university_artifact_birth_certificates','lab.artifacts','public.cos_university_signed_birth_envelopes'])
})
test('Phase 2: host tenant mismatch denies all authority resolution and DB reads',async()=>{
 const f=fixture()
 let resolutions=0
 assert.equal(await auditBirthAgainstTenantDatabase({...f.input,authenticatedTenantId:'different',resolveTrustedRun:async()=>{resolutions++;return null}}),'not_authorized')
 assert.equal(resolutions,0)
 assert.deepEqual(f.reads,[])
})
test('Phase 2: foreign artifact ownership denies certificate and envelope reads',async()=>{
 const f=fixture('22222222-3333-4444-8555-666666666666')
 assert.equal(await auditBirthAgainstTenantDatabase(f.input),'read_failed')
 assert.deepEqual(f.reads,['lab.artifacts'])
})
test('Phase 2: revoked Harness authorization denies access even when ownership matches',async()=>{
 const f=fixture()
 assert.equal(await auditBirthAgainstTenantDatabase({...f.input,resolveTrustedRun:async()=>({manifest,status:'cancelled' as const,authorityVerified:true})}),'not_authorized')
 assert.deepEqual(f.reads,[])
})
