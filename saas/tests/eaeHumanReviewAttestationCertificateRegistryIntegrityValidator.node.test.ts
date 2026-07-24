import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewAttestationCertificateRegistryIntegrity } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const entry={certificateId:'eae_human_review_attestation_certificate_deadbeef',certificateSerial:'EAE-HRAC-DEADBEEF',validationId:'validation-1',disposition:'valid' as const,valid:true,attestationIds:['attestation-1'],evidenceRefs:['evidence-2','evidence-1'],readOnly:true as const,executable:false as const};
const registry={schemaVersion:'1.0.0' as const,registryId:'registry-1',tenant,disposition:'complete' as const,entries:[entry],priorCertificateIds:[],evidenceRefs:['registry-evidence'],truncated:false,readOnly:true as const,executable:false as const};

test('builds deterministic immutable validation results',()=>{
  const first=validateEnterpriseHumanReviewAttestationCertificateRegistryIntegrity({tenant,registry,maxEntries:10});
  const second=validateEnterpriseHumanReviewAttestationCertificateRegistryIntegrity({tenant,registry,maxEntries:10});
  assert.deepEqual(first,second);
  assert.equal(first.valid,true);
  assert.equal(first.disposition,'valid');
  assert.deepEqual(first.evidenceRefs,['evidence-1','evidence-2','registry-evidence']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(Object.isFrozen(first.errors),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('detects duplicate certificate identities and serials',()=>{
  const result=validateEnterpriseHumanReviewAttestationCertificateRegistryIntegrity({tenant,registry:{...registry,entries:[entry,{...entry}]},maxEntries:10});
  assert.equal(result.valid,false);
  assert.deepEqual(result.errors,['duplicate_certificate_id','duplicate_certificate_serial']);
});

test('detects disposition conflicts and invalid serials',()=>{
  const invalidEntry={...entry,certificateSerial:'bad',valid:false,disposition:'valid' as const};
  const result=validateEnterpriseHumanReviewAttestationCertificateRegistryIntegrity({tenant,registry:{...registry,disposition:'complete',entries:[invalidEntry]},maxEntries:10});
  assert.equal(result.valid,false);
  assert.deepEqual(result.errors,['complete_certificate_registry_contains_non_valid_entry','invalid_attestation_certificate_serial','invalid_certificate_entry_marked_valid']);
});

test('supports empty registries',()=>{
  const result=validateEnterpriseHumanReviewAttestationCertificateRegistryIntegrity({tenant,registry:{...registry,disposition:'empty',entries:[]},maxEntries:10});
  assert.equal(result.valid,true);
  assert.equal(result.disposition,'empty');
});

test('reports bounded truncation',()=>{
  const second={...entry,certificateId:'eae_human_review_attestation_certificate_cafebabe',certificateSerial:'EAE-HRAC-CAFEBABE',validationId:'validation-2'};
  const result=validateEnterpriseHumanReviewAttestationCertificateRegistryIntegrity({tenant,registry:{...registry,entries:[entry,second]},maxEntries:1});
  assert.equal(result.truncated,true);
  assert.deepEqual(result.validatedCertificateIds,[entry.certificateId]);
});

test('rejects tenant and unsafe boundaries',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryIntegrity({tenant:{tenantId:'tenant-b',environmentId:'env-a'},registry,maxEntries:10}),/tenant_boundary_violation/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryIntegrity({tenant,registry:{...registry,executable:true as false},maxEntries:10}),/unsafe_attestation_certificate_registry_rejected/);
});

test('enforces validation bounds',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryIntegrity({tenant,registry,maxEntries:0}),/unbounded_attestation_certificate_registry_integrity_validation_rejected/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryIntegrity({tenant,registry,maxEntries:513}),/unbounded_attestation_certificate_registry_integrity_validation_rejected/);
});
