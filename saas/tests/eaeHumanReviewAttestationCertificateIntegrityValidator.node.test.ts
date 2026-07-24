import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewAttestationCertificateIntegrity } from '../lib/autonomous-systems/human-review-attestation-certificate-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const certificate={schemaVersion:'1.0.0' as const,certificateId:'eae_human_review_attestation_certificate_1234abcd',certificateSerial:'EAE-HRAC-1234ABCD',tenant,registryId:'registry-1',validationId:'validation-1',issuerId:'issuer-1',certificateLabel:'Certificate',disposition:'certified' as const,attestationIds:['a2','a1'],evidenceRefs:['z','a'],readOnly:true as const,executable:false as const};

test('builds deterministic immutable valid integrity results',()=>{
  const a=validateEnterpriseHumanReviewAttestationCertificateIntegrity({tenant,certificate,maxAttestationIds:10});
  const b=validateEnterpriseHumanReviewAttestationCertificateIntegrity({tenant,certificate,maxAttestationIds:10});
  assert.deepEqual(a,b); assert.equal(a.valid,true); assert.equal(a.disposition,'valid'); assert.deepEqual(a.validatedAttestationIds,['a1','a2']); assert.deepEqual(a.evidenceRefs,['a','z']); assert.equal(Object.isFrozen(a),true); assert.equal(a.executable,false);
});

test('rejects tenant and unsafe boundaries',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateIntegrity({tenant:{tenantId:'other',environmentId:'env-a'},certificate,maxAttestationIds:10}),/tenant_boundary/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateIntegrity({tenant,certificate:{...certificate,executable:true as false},maxAttestationIds:10}),/unsafe/);
});

test('detects serial, duplicate, and disposition conflicts',()=>{
  const result=validateEnterpriseHumanReviewAttestationCertificateIntegrity({tenant,certificate:{...certificate,certificateSerial:'BAD',attestationIds:['a1','a1'],disposition:'empty'},maxAttestationIds:10});
  assert.equal(result.valid,false); assert.equal(result.disposition,'invalid'); assert.deepEqual(result.errors,['duplicate_attestation_id','empty_certificate_contains_attestations','invalid_attestation_certificate_serial']);
});

test('supports empty certificates and bounded validation',()=>{
  const empty=validateEnterpriseHumanReviewAttestationCertificateIntegrity({tenant,certificate:{...certificate,disposition:'empty',attestationIds:[]},maxAttestationIds:1});
  assert.equal(empty.disposition,'empty');
  const bounded=validateEnterpriseHumanReviewAttestationCertificateIntegrity({tenant,certificate,maxAttestationIds:1});
  assert.equal(bounded.truncated,true); assert.deepEqual(bounded.validatedAttestationIds,['a2']);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateIntegrity({tenant,certificate,maxAttestationIds:0}),/unbounded/);
});
