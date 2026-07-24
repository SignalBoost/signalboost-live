import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationIntegrity } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const attestation={schemaVersion:'1.0.0' as const,attestationId:'att-1',tenant,registryId:'reg-1',validationId:'val-1',attestorId:'human-1',statement:'Reviewed',disposition:'attested' as const,certificateIds:['cert-b','cert-a'],evidenceRefs:['z','a'],readOnly:true as const,executable:false as const};

test('validates deterministically and freezes output',()=>{
  const first=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationIntegrity({tenant,attestation,maxCertificateIds:10});
  const second=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationIntegrity({tenant,attestation,maxCertificateIds:10});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'valid');
  assert.deepEqual(first.validatedCertificateIds,['cert-a','cert-b']);
  assert.deepEqual(first.evidenceRefs,['a','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('reports duplicates, empty conflicts, and truncation',()=>{
  const duplicate={...attestation,certificateIds:['cert-a','cert-a']};
  const duplicateResult=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationIntegrity({tenant,attestation:duplicate,maxCertificateIds:10});
  assert.equal(duplicateResult.valid,false);
  assert.deepEqual(duplicateResult.errors,['duplicate_certificate_id']);
  const emptyConflict={...attestation,disposition:'empty' as const,certificateIds:['cert-a']};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationIntegrity({tenant,attestation:emptyConflict,maxCertificateIds:10}).errors,['empty_attestation_contains_certificates']);
  const truncated=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationIntegrity({tenant,attestation,maxCertificateIds:1});
  assert.equal(truncated.truncated,true);
  assert.deepEqual(truncated.validatedCertificateIds,['cert-b']);
});

test('enforces tenant, safety, identity, and bounds',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationIntegrity({tenant:{tenantId:'other',environmentId:'env-a'},attestation,maxCertificateIds:10}),/tenant_boundary_violation/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationIntegrity({tenant,attestation:{...attestation,executable:true as false},maxCertificateIds:10}),/unsafe_certificate_registry_attestation_rejected/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationIntegrity({tenant,attestation,maxCertificateIds:0}),/unbounded/);
  const missing={...attestation,attestorId:''};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationIntegrity({tenant,attestation:missing,maxCertificateIds:10}).errors,['certificate_registry_attestation_identity_required']);
});
