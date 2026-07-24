import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateIntegrity } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const certificate={schemaVersion:'1.0.0' as const,certificateId:'cert-1',certificateSerial:'EAE-HRACR-ABCDEF12',tenant,registryId:'reg-1',validationId:'val-1',issuerId:'issuer-1',disposition:'certified' as const,attestationIds:['att-b','att-a'],evidenceRefs:['z','a'],readOnly:true as const,executable:false as const};

test('validates deterministically and freezes output',()=>{
  const first=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateIntegrity({tenant,certificate,maxAttestationIds:10});
  const second=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateIntegrity({tenant,certificate,maxAttestationIds:10});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'valid');
  assert.deepEqual(first.validatedAttestationIds,['att-a','att-b']);
  assert.deepEqual(first.evidenceRefs,['a','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('reports duplicate, serial, empty, and truncation conflicts',()=>{
  const duplicate={...certificate,attestationIds:['att-a','att-a']};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateIntegrity({tenant,certificate:duplicate,maxAttestationIds:10}).errors,['duplicate_attestation_id']);
  const invalidSerial={...certificate,certificateSerial:'bad'};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateIntegrity({tenant,certificate:invalidSerial,maxAttestationIds:10}).errors,['invalid_certificate_registry_attestation_registry_certificate_serial']);
  const emptyConflict={...certificate,disposition:'empty' as const};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateIntegrity({tenant,certificate:emptyConflict,maxAttestationIds:10}).errors,['empty_certificate_contains_attestations']);
  const truncated=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateIntegrity({tenant,certificate,maxAttestationIds:1});
  assert.equal(truncated.truncated,true);
  assert.deepEqual(truncated.validatedAttestationIds,['att-b']);
});

test('enforces tenant, safety, identity, and bounds',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateIntegrity({tenant:{tenantId:'other',environmentId:'env-a'},certificate,maxAttestationIds:10}),/tenant_boundary_violation/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateIntegrity({tenant,certificate:{...certificate,executable:true as false},maxAttestationIds:10}),/unsafe/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateIntegrity({tenant,certificate,maxAttestationIds:0}),/unbounded/);
  const missing={...certificate,issuerId:''};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateIntegrity({tenant,certificate:missing,maxAttestationIds:10}).errors,['certificate_registry_attestation_registry_certificate_identity_required']);
});
