import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationIntegrity } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'prod'};
const attestation={schemaVersion:'1.0.0' as const,attestationId:'attestation-1',tenant,registryId:'registry-1',validationId:'validation-1',attestorId:'attestor-1',disposition:'attested' as const,certificateIds:['cert-1'],evidenceRefs:['evidence-1'],readOnly:true as const,executable:false as const};

test('validates deterministic safe attestation',()=>{
  const first=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation,expectedAttestorId:'attestor-1',maxCertificateIds:8});
  const second=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation,expectedAttestorId:'attestor-1',maxCertificateIds:8});
  assert.equal(first.valid,true);
  assert.equal(first.disposition,'valid');
  assert.deepEqual(first.validatedCertificateIds,['cert-1']);
  assert.equal(first.validationId,second.validationId);
  assert.equal(Object.isFrozen(first),true);
});

test('rejects mismatched attestor and duplicate certificates',()=>{
  const result=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation:{...attestation,certificateIds:['cert-1','cert-1']},expectedAttestorId:'attestor-2',maxCertificateIds:8});
  assert.equal(result.valid,false);
  assert.deepEqual(result.errors,['attestor_id_mismatch','duplicate_certificate_id']);
});

test('enforces tenant and bounded validation',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationIntegrity({tenant:{tenantId:'tenant-b',environmentId:'prod'},attestation,maxCertificateIds:8}),/tenant_boundary_violation/);
  assert.throws(()=>validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation,maxCertificateIds:0}),/unbounded_nested_attestation_registry_certificate_registry_attestation_integrity_validation_rejected/);
  const result=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationIntegrity({tenant,attestation:{...attestation,certificateIds:['cert-1','cert-2']},maxCertificateIds:1});
  assert.equal(result.truncated,true);
  assert.deepEqual(result.validatedCertificateIds,['cert-1']);
});
