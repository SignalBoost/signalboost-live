import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryIntegrity } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const entry={certificateId:'cert-1',certificateSerial:'EAE-HRACR-ABCDEF12',registryId:'reg-source',validationId:'val-source',disposition:'valid' as const,valid:true,attestationIds:['att-1'],evidenceRefs:['z','a'],readOnly:true as const,executable:false as const};
const registry={schemaVersion:'1.0.0' as const,registryId:'reg-1',tenant,disposition:'complete' as const,entries:[entry],priorCertificateIds:[],rejectedCertificateIds:[],evidenceRefs:['b'],truncated:false,readOnly:true as const,executable:false as const};

test('validates deterministically and freezes output',()=>{
  const first=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant,registry,maxEntries:10});
  const second=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant,registry,maxEntries:10});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'valid');
  assert.deepEqual(first.validatedCertificateIds,['cert-1']);
  assert.deepEqual(first.evidenceRefs,['a','b','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('reports duplicate identities and disposition conflicts',()=>{
  const duplicate={...registry,entries:[entry,{...entry}]};
  const duplicateResult=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant,registry:duplicate,maxEntries:10});
  assert.deepEqual(duplicateResult.errors,['duplicate_certificate_id','duplicate_certificate_serial']);
  const emptyConflict={...registry,disposition:'empty' as const};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant,registry:emptyConflict,maxEntries:10}).errors,['empty_certificate_registry_attestation_registry_certificate_registry_contains_entries']);
});

test('enforces tenant, safety, serial format, bounds, and truncation',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant:{tenantId:'other',environmentId:'env-a'},registry,maxEntries:10}),/tenant_boundary_violation/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant,registry:{...registry,executable:true as false},maxEntries:10}),/unsafe/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant,registry,maxEntries:0}),/unbounded/);
  const malformed={...registry,entries:[{...entry,certificateSerial:'bad'}]};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant,registry:malformed,maxEntries:10}).errors,['invalid_certificate_registry_attestation_registry_certificate_serial']);
  const truncated={...registry,entries:[entry,{...entry,certificateId:'cert-2',certificateSerial:'EAE-HRACR-ABCDEF13'}]};
  assert.equal(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant,registry:truncated,maxEntries:1}).truncated,true);
});
