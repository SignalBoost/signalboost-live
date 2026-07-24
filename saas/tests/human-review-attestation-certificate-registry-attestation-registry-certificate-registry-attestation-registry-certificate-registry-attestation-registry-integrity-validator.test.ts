import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const entry={attestationId:'att-1',registryId:'reg-1',validationId:'val-1',attestorId:'reviewer-1',disposition:'valid' as const,valid:true,certificateIds:['cert-1'],evidenceRefs:['b','a'],readOnly:true as const,executable:false as const};
const registry={schemaVersion:'1.0.0' as const,registryId:'nested-reg-1',tenant,disposition:'complete' as const,entries:[entry],priorAttestationIds:[],rejectedAttestationIds:[],evidenceRefs:['z'],truncated:false,readOnly:true as const,executable:false as const};

test('validates deterministically and freezes output',()=>{
  const first=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry,maxEntries:10});
  const second=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry,maxEntries:10});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'valid');
  assert.deepEqual(first.validatedAttestationIds,['att-1']);
  assert.deepEqual(first.evidenceRefs,['a','b','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('reports duplicate, identity, disposition, and truncation conflicts',()=>{
  const duplicate={...registry,entries:[entry,{...entry}]};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:duplicate,maxEntries:10}).errors,['duplicate_attestation_id']);
  const missing={...registry,entries:[{...entry,attestorId:''}]};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:missing,maxEntries:10}).errors,['nested_attestation_registry_entry_identity_required']);
  const completeInvalid={...registry,entries:[{...entry,valid:false,disposition:'invalid' as const}]};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:completeInvalid,maxEntries:10}).errors,['complete_nested_attestation_registry_contains_invalid_entry']);
  const truncated=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:duplicate,maxEntries:1});
  assert.equal(truncated.truncated,true);
  assert.deepEqual(truncated.validatedAttestationIds,['att-1']);
});

test('enforces tenant, safety, and bounds',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant:{tenantId:'other',environmentId:'env-a'},registry,maxEntries:10}),/tenant_boundary_violation/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:{...registry,executable:true as false},maxEntries:10}),/unsafe/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry,maxEntries:0}),/unbounded/);
});
