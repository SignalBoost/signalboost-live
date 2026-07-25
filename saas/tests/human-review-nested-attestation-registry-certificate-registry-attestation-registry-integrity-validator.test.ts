import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrity } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const entry={attestationId:'attestation-1',registryId:'registry-source',validationId:'validation-1',attestorId:'attestor-1',disposition:'valid' as const,valid:true,certificateIds:['cert-a'],evidenceRefs:['evidence-a'],readOnly:true as const,executable:false as const};
const registry={schemaVersion:'1.0.0' as const,registryId:'registry-1',tenant,disposition:'complete' as const,entries:[entry],priorAttestationIds:[],rejectedAttestationIds:[],evidenceRefs:['evidence-a'],truncated:false,readOnly:true as const,executable:false as const};

test('validates deterministic frozen nested attestation registry integrity',()=>{
  const first=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry,maxEntries:10});
  const second=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry,maxEntries:10});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'valid');
  assert.equal(first.valid,true);
  assert.deepEqual(first.validatedAttestationIds,['attestation-1']);
  assert.equal(Object.isFrozen(first),true);
});

test('detects duplicates and inconsistent complete registries',()=>{
  const invalidRegistry={...registry,entries:[entry,{...entry}],disposition:'complete' as const};
  const result=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:invalidRegistry,maxEntries:10});
  assert.equal(result.valid,false);
  assert.ok(result.errors.includes('duplicate_attestation_id'));
  const inconsistent={...registry,entries:[{...entry,valid:false,disposition:'invalid' as const}]};
  assert.ok(validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:inconsistent,maxEntries:10}).errors.includes('complete_nested_attestation_registry_certificate_registry_attestation_registry_contains_invalid_entry'));
});

test('enforces tenant, safety, bounds, and truncation',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant:{tenantId:'other',environmentId:'env-a'},registry,maxEntries:10}),/tenant_boundary_violation/);
  assert.throws(()=>validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:{...registry,executable:true as false},maxEntries:10}),/unsafe/);
  assert.throws(()=>validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry,maxEntries:0}),/unbounded/);
  const result=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:{...registry,entries:[entry,{...entry,attestationId:'attestation-2'}]},maxEntries:1});
  assert.equal(result.truncated,true);
});
