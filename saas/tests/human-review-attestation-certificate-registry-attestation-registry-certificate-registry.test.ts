import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistry } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const integrity={schemaVersion:'1.0.0' as const,validationId:'val-1',tenant,certificateId:'cert-1',certificateSerial:'EAE-HRACR-1234ABCD',registryId:'reg-1',disposition:'valid' as const,valid:true,errors:[],validatedAttestationIds:['att-b','att-a'],evidenceRefs:['z','a'],truncated:false,readOnly:true as const,executable:false as const};

test('builds deterministically and freezes output',()=>{
  const first=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistry({tenant,integrityResults:[integrity],priorCertificateIds:[],maxEntries:10});
  const second=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistry({tenant,integrityResults:[integrity],priorCertificateIds:[],maxEntries:10});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'complete');
  assert.deepEqual(first.entries[0]?.attestationIds,['att-a','att-b']);
  assert.deepEqual(first.evidenceRefs,['a','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('suppresses prior and duplicate certificates and reports truncation',()=>{
  const prior=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistry({tenant,integrityResults:[integrity],priorCertificateIds:['cert-1'],maxEntries:10});
  assert.deepEqual(prior.entries,[]);
  assert.deepEqual(prior.rejectedCertificateIds,['cert-1']);
  const duplicate={...integrity,validationId:'val-2'};
  const duplicates=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistry({tenant,integrityResults:[integrity,duplicate],priorCertificateIds:[],maxEntries:10});
  assert.equal(duplicates.disposition,'partial');
  assert.deepEqual(duplicates.rejectedCertificateIds,['cert-1']);
  const second={...integrity,certificateId:'cert-2',certificateSerial:'EAE-HRACR-8765DCBA'};
  const truncated=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistry({tenant,integrityResults:[integrity,second],priorCertificateIds:[],maxEntries:1});
  assert.equal(truncated.truncated,true);
  assert.equal(truncated.entries.length,1);
});

test('maps rejected and empty registries',()=>{
  const rejected=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistry({tenant,integrityResults:[{...integrity,disposition:'invalid' as const,valid:false}],priorCertificateIds:[],maxEntries:10});
  assert.equal(rejected.disposition,'rejected');
  const empty=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistry({tenant,integrityResults:[],priorCertificateIds:[],maxEntries:10});
  assert.equal(empty.disposition,'empty');
});

test('enforces tenant, safety, and bounds',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistry({tenant:{tenantId:'other',environmentId:'env-a'},integrityResults:[integrity],priorCertificateIds:[],maxEntries:10}),/tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistry({tenant,integrityResults:[{...integrity,executable:true as false}],priorCertificateIds:[],maxEntries:10}),/unsafe/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistry({tenant,integrityResults:[integrity],priorCertificateIds:[],maxEntries:0}),/unbounded/);
});
