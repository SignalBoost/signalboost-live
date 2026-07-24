import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryIntegrity } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const entry={certificateId:'cert-1',certificateSerial:'EAE-HRARR-ABCDEF12',registryId:'reg-1',validationId:'val-1',issuerId:'issuer-1',disposition:'valid' as const,valid:true,attestationIds:['att-b','att-a'],evidenceRefs:['z','a'],readOnly:true as const,executable:false as const};
const registry={schemaVersion:'1.0.0' as const,registryId:'nested-reg-1',tenant,disposition:'complete' as const,entries:[entry],priorCertificateIds:[],rejectedCertificateIds:[],evidenceRefs:['z','a'],truncated:false,readOnly:true as const,executable:false as const};

test('validates deterministically and freezes output',()=>{
  const request={tenant,registry,maxEntries:10};
  const first=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryIntegrity(request);
  const second=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryIntegrity(request);
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'valid');
  assert.deepEqual(first.validatedCertificateIds,['cert-1']);
  assert.deepEqual(first.evidenceRefs,['a','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('reports duplicate identities, invalid completeness, and truncation',()=>{
  const duplicate={...entry,validationId:'val-2'};
  const invalid={...entry,certificateId:'cert-2',certificateSerial:'EAE-HRARR-22222222',validationId:'val-3',disposition:'invalid' as const,valid:false};
  const conflicted={...registry,entries:[entry,duplicate,invalid],disposition:'complete' as const};
  const result=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant,registry:conflicted,maxEntries:2});
  assert.deepEqual(result.errors,['complete_nested_certificate_registry_contains_invalid_entry','duplicate_certificate_id','duplicate_certificate_serial']);
  assert.equal(result.disposition,'invalid');
  assert.equal(result.truncated,true);
  assert.deepEqual(result.validatedCertificateIds,['cert-1','cert-1']);
});

test('enforces tenant, safety, empty consistency, and bounds',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant:{tenantId:'other',environmentId:'env-a'},registry,maxEntries:10}),/tenant_boundary_violation/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant,registry:{...registry,executable:true as false},maxEntries:10}),/unsafe/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant,registry,maxEntries:0}),/unbounded/);
  const emptyConflict={...registry,disposition:'empty' as const};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant,registry:emptyConflict,maxEntries:10}).errors,['empty_nested_certificate_registry_contains_entries']);
  const missingIdentity={...registry,entries:[{...entry,issuerId:''}]};
  assert.deepEqual(validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryIntegrity({tenant,registry:missingIdentity,maxEntries:10}).errors,['nested_certificate_registry_entry_identity_required']);
});
