import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const entry={attestationId:'att-1',registryId:'reg-source',validationId:'val-1',disposition:'valid' as const,valid:true,certificateIds:['cert-1'],evidenceRefs:['z','a'],readOnly:true as const,executable:false as const};
const registry={schemaVersion:'1.0.0' as const,registryId:'reg-1',tenant,disposition:'complete' as const,entries:[entry],priorAttestationIds:[],rejectedAttestationIds:[],evidenceRefs:['b'],truncated:false,readOnly:true as const,executable:false as const};

test('validates deterministically and freezes output',()=>{
  const first=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry,maxEntries:10});
  const second=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry,maxEntries:10});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'valid');
  assert.deepEqual(first.validatedAttestationIds,['att-1']);
  assert.deepEqual(first.evidenceRefs,['a','b','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('detects duplicates and disposition conflicts',()=>{
  const duplicate=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:{...registry,entries:[entry,{...entry}]},maxEntries:10});
  assert.equal(duplicate.valid,false);
  assert.match(duplicate.errors.join(','),/duplicate_attestation_id/);
  const conflict=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:{...registry,entries:[{...entry,valid:false}],disposition:'complete'},maxEntries:10});
  assert.match(conflict.errors.join(','),/complete_.*invalid_entry/);
});

test('supports empty registries and truncation',()=>{
  const empty=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:{...registry,entries:[],disposition:'empty',evidenceRefs:[]},maxEntries:1});
  assert.equal(empty.disposition,'empty');
  const truncated=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:{...registry,entries:[entry,{...entry,attestationId:'att-2'}]},maxEntries:1});
  assert.equal(truncated.truncated,true);
  assert.deepEqual(truncated.validatedAttestationIds,['att-1']);
});

test('enforces tenant, safety, identity, and bounds',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant:{tenantId:'other',environmentId:'env-a'},registry,maxEntries:1}),/tenant_boundary_violation/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:{...registry,executable:true as false},maxEntries:1}),/unsafe/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry,maxEntries:0}),/unbounded/);
  const missing=validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryIntegrity({tenant,registry:{...registry,entries:[{...entry,attestationId:''}]},maxEntries:1});
  assert.match(missing.errors.join(','),/identity_required/);
});
