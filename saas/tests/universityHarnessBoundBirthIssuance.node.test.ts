import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import { issueBirthWithTrustedHarness } from '../lib/ai/cos/universityHarnessBoundBirthIssuance.ts'
import { issuerKeyFingerprint } from '../lib/ai/cos/universityArtifactBirthVerification.ts'
import { BIRTH_ISSUE_CAPABILITY } from '../lib/ai/cos/universityBirthHarnessGrant.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'
import type { SignedBirthStorageRow } from '../lib/ai/cos/universityVerifiedBirthPersistence.ts'
const id='f2cb6434-a7ac-49ee-88f0-34a94f31a422'
const grant={approved:true,tenantId:'tenant-1',harnessRunId:'run-1',permanentArtifactId:id}
const birth={permanent_artifact_id:id,trained_artifact_hash:'a'.repeat(64),revision_key:'b'.repeat(64),dataset_hash:'c'.repeat(64),parent_permanent_artifact_id:null,issuance_kind:'native_birth'}
const kp=generateKeyPairSync('ed25519')
const pem=kp.publicKey.export({format:'pem',type:'spki'}).toString()
const manifest:HarnessManifest={
 runId:'run-1',objective:'signed birth',profile:'production',
 identity:{agentId:'issuer',role:'issuer',tenantId:'tenant-1',artifact:{artifactId:id}},
 environment:{environmentId:'issuer',class:'production'},authorityManifestRef:'trusted-authority',
 capabilities:[{id:BIRTH_ISSUE_CAPABILITY,mutating:true,risk:'consequential',scopes:[id],environments:['production']}],
 limits:{maxToolCalls:1},learningFeedbackAllowed:false,
}
function make(status:'active'|'completed'='active'){
 let signing=0,writes=0,stored:SignedBirthStorageRow|null=null,lookups=0
 const input={
  grant,
  resolveTrustedRun:async()=>{lookups++;return {manifest,status,authorityVerified:true}},
  readNativeBirth:async()=>birth,
  signer:async(bytes:Uint8Array)=>{signing++;return sign(null,bytes,kp.privateKey)},
  issuerPublicKeyPem:pem,trustedIssuerFingerprint:issuerKeyFingerprint(pem)!,
  storage:{
   readNativeBirth:async()=>birth,
   insertOnce:async (row:SignedBirthStorageRow)=>{writes++;stored=row;return true},
   readStored:async()=>stored,
  },
 }
 return {input,stats:()=>({signing,writes,lookups})}
}
test('verified active Harness resolution is required throughout signature issuance',async()=>{
 const s=make()
 assert.equal(await issueBirthWithTrustedHarness(s.input),'verified_persisted')
 assert.deepEqual(s.stats(),{signing:1,writes:1,lookups:2})
})
test('completed HarnessRun refuses signing and persistence',async()=>{
 const s=make('completed')
 assert.equal(await issueBirthWithTrustedHarness(s.input),'invalid_grant')
 assert.deepEqual(s.stats(),{signing:0,writes:0,lookups:1})
})
test('scope mismatch prevents external signature creation',async()=>{
 const s=make()
 assert.equal(await issueBirthWithTrustedHarness({...s.input,grant:{...grant,tenantId:'other'}}),'invalid_grant')
 assert.equal(s.stats().signing,0)
})
test('revocation after read prevents persistence',async()=>{
 const s=make()
 let calls=0
 const outcome=await issueBirthWithTrustedHarness({...s.input,resolveTrustedRun:async()=>{
   calls++; return {manifest,status:calls===1?'active' as const:'cancelled' as const,authorityVerified:true}
 }})
 assert.equal(outcome,'not_authorized')
 // Storage must be refused, but on this base branch signing already occurred.
 // PR #3830 is required to eliminate the earlier signing window.
 assert.equal(s.stats().signing,1)
 assert.equal(s.stats().writes,0)
})
