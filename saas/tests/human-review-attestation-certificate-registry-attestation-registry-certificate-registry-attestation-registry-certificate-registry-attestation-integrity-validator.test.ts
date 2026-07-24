import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const attestation={schemaVersion:'1.0.0' as const,attestationId:'att-1',tenant,registryId:'reg-1',validationId:'val-1',attestorId:'attestor-1',disposition:'attested' as const,certificateIds:['cert-b','cert-a'],evidenceRefs:['z','a'],readOnly:true as const,executable:false as const};

test('validates deterministically and freezes output',()=>{
  const first=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation,expectedAttestorId:'attestor-1',maxCertificateIds:10});
  const second=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation,expectedAttestorId:'attestor-1',maxCertificateIds:10});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'valid');
  assert.equal(first.registryId,'reg-1');
  assert.equal(first.sourceValidationId,'val-1');
  assert.equal(first.attestorId,'attestor-1');
  assert.deepEqual(first.validatedCertificateIds,['cert-a','cert-b']);
  assert.deepEqual(first.evidenceRefs,['a','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('reports duplicate, attestor, empty, and truncation conflicts',()=>{
  const duplicate={...attestation,certificateIds:['cert-a','cert-a']};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation:duplicate,maxCertificateIds:10}).errors,['duplicate_certificate_id']);
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation,expectedAttestorId:'attestor-2',maxCertificateIds:10}).errors,['attestor_id_mismatch']);
  const emptyConflict={...attestation,disposition:'empty' as const};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation:emptyConflict,maxCertificateIds:10}).errors,['empty_attestation_contains_certificates']);
  const truncated=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation,maxCertificateIds:1});
  assert.equal(truncated.truncated,true);
  assert.deepEqual(truncated.validatedCertificateIds,['cert-b']);
});

test('enforces tenant, safety, identity, and bounds',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant:{tenantId:'other',environmentId:'env-a'},attestation,maxCertificateIds:10}),/tenant_boundary_violation/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation:{...attestation,executable:true as false},maxCertificateIds:10}),/unsafe/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation,maxCertificateIds:0}),/unbounded/);
  const missing={...attestation,attestationId:'',attestorId:''};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation:missing,maxCertificateIds:10}).errors,['attestor_id_required','nested_certificate_registry_attestation_identity_required']);
});
