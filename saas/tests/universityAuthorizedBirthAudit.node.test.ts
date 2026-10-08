import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import { auditTenantBirthCertificate } from '../lib/ai/cos/universityAuthorizedBirthAudit.ts'
import { canonicalBirthBytes, artifactVin, issuerKeyFingerprint } from '../lib/ai/cos/universityArtifactBirthVerification.ts'

const id='f2cb6434-a7ac-49ee-88f0-34a94f31a422'
const birth={permanent_artifact_id:id,trained_artifact_hash:'a'.repeat(64),revision_key:'b'.repeat(64),dataset_hash:'c'.repeat(64),parent_permanent_artifact_id:null,issuance_kind:'native_birth'}
const identity={permanentArtifactId:id,trainedArtifactHash:birth.trained_artifact_hash,revisionKey:birth.revision_key,datasetHash:birth.dataset_hash,parentPermanentArtifactId:null}
const keys=generateKeyPairSync('ed25519')
const pem=keys.publicKey.export({format:'pem',type:'spki'}).toString()
const pin=issuerKeyFingerprint(pem)!
const envelope={permanent_artifact_id:id,trained_artifact_hash:birth.trained_artifact_hash,revision_key:birth.revision_key,dataset_hash:birth.dataset_hash,parent_permanent_artifact_id:null,vin:artifactVin(identity)!,algorithm:'ed25519' as const,signature_base64:sign(null,canonicalBirthBytes(identity)!,keys.privateKey).toString('base64'),issuer_public_key_pem:pem,issuer_fingerprint:pin}
const context={tenantId:'tenant-1',permanentArtifactId:id,harnessRunId:'run-1'}
function setup(allowedChecks=3){
 let checks=0,birthReads=0,signedReads=0
 const input={context,authorize:async()=>++checks<=allowedChecks,trustedIssuerFingerprint:pin,
  source:{readBirth:async()=>{birthReads++;return birth},readSignedEnvelope:async()=>{signedReads++;return envelope}}}
 return {input,stats:()=>({checks,birthReads,signedReads})}
}
test('Phase 2: a tenant-authorized, signed certificate can be independently audited',async()=>{
 const s=setup()
 assert.equal(await auditTenantBirthCertificate(s.input),'verified')
 assert.deepEqual(s.stats(),{checks:3,birthReads:1,signedReads:1})
})
test('Phase 2: denied tenant never reads any record',async()=>{
 const s=setup(0)
 assert.equal(await auditTenantBirthCertificate(s.input),'not_authorized')
 assert.deepEqual(s.stats(),{checks:1,birthReads:0,signedReads:0})
})
test('Phase 2: revocation between reads blocks signed-envelope access',async()=>{
 const s=setup(1)
 assert.equal(await auditTenantBirthCertificate(s.input),'not_authorized')
 assert.deepEqual(s.stats(),{checks:2,birthReads:1,signedReads:0})
})
test('Phase 2: revocation after both reads never releases verified certificate',async()=>{
 const s=setup(2)
 assert.equal(await auditTenantBirthCertificate(s.input),'not_authorized')
 assert.deepEqual(s.stats(),{checks:3,birthReads:1,signedReads:1})
})
test('Phase 2: cross-artifact data adapter error fails closed',async()=>{
 const s=setup()
 const result=await auditTenantBirthCertificate({...s.input,source:{...s.input.source,readSignedEnvelope:async()=>({...envelope,permanent_artifact_id:'11111111-2222-4333-8444-555555555555'})}})
 assert.equal(result,'read_failed')
})
