import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const attestation={schemaVersion:'1.0.0' as const,attestationId:'att-1',tenant,registryId:'reg-1',validationId:'val-1',attestorId:'reviewer-1',disposition:'attested' as const,certificateIds:['cert-b','cert-a'],evidenceRefs:['z','a'],readOnly:true as const,executable:false as const};

test('validates deterministically and freezes output',()=>{
  const first=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation,maxCertificateIds:10});
  const second=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation,maxCertificateIds:10});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'valid');
  assert.deepEqual(first.validatedCertificateIds,['cert-a','cert-b']);
  assert.deepEqual(first.evidenceRefs,['a','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('detects duplicates and disposition conflicts',()=>{
  const duplicate=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation:{...attestation,certificateIds:['cert-a','cert-a']},maxCertificateIds:10});
  assert.equal(duplicate.valid,false);
  assert.match(duplicate.errors.join(','),/duplicate_certificate_id/);
  const emptyConflict=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation:{...attestation,disposition:'empty' as const},maxCertificateIds:10});
  assert.match(emptyConflict.errors.join(','),/empty_attestation_contains_certificates/);
  const attestedConflict=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation:{...attestation,certificateIds:[]},maxCertificateIds:10});
  assert.match(attestedConflict.errors.join(','),/attested_attestation_missing_certificates/);
});

test('enforces tenant, safety, identity, bounds, and truncation',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant:{tenantId:'other',environmentId:'env-a'},attestation,maxCertificateIds:10}),/tenant_boundary_violation/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation:{...attestation,executable:true as false},maxCertificateIds:10}),/unsafe/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation,maxCertificateIds:0}),/unbounded/);
  const missing=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation:{...attestation,attestorId:''},maxCertificateIds:10});
  assert.match(missing.errors.join(','),/identity_required/);
  const truncated=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation,maxCertificateIds:1});
  assert.equal(truncated.truncated,true);
  assert.equal(truncated.validatedCertificateIds.length,1);
});
