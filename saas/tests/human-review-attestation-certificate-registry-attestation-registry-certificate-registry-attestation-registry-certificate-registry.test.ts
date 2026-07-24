import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistry } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const integrity={schemaVersion:'1.0.0' as const,validationId:'val-1',tenant,certificateId:'cert-1',certificateSerial:'EAE-HRARR-ABCDEF12',registryId:'reg-1',issuerId:'issuer-1',disposition:'valid' as const,valid:true,errors:[],validatedAttestationIds:['att-b','att-a'],evidenceRefs:['z','a'],truncated:false,readOnly:true as const,executable:false as const};

test('builds deterministically and freezes output',()=>{
  const request={tenant,integrityResults:[integrity],priorCertificateIds:[],maxEntries:10};
  const first=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistry(request);
  const second=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistry(request);
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'complete');
  assert.deepEqual(first.entries[0]?.attestationIds,['att-a','att-b']);
  assert.deepEqual(first.evidenceRefs,['a','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('rejects duplicate ids and serials and reports truncation',()=>{
  const duplicateId={...integrity,validationId:'val-2'};
  const duplicateSerial={...integrity,certificateId:'cert-2',validationId:'val-3'};
  const result=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistry({tenant,integrityResults:[integrity,duplicateId,duplicateSerial],priorCertificateIds:[],maxEntries:1});
  assert.equal(result.entries.length,1);
  assert.deepEqual(result.rejectedCertificateIds,['cert-1','cert-2']);
  assert.equal(result.disposition,'partial');
  assert.equal(result.truncated,true);
});

test('suppresses prior certificates and enforces boundaries',()=>{
  const prior=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistry({tenant,integrityResults:[integrity],priorCertificateIds:['cert-1'],maxEntries:10});
  assert.equal(prior.entries.length,0);
  assert.deepEqual(prior.rejectedCertificateIds,['cert-1']);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistry({tenant:{tenantId:'other',environmentId:'env-a'},integrityResults:[integrity],priorCertificateIds:[],maxEntries:10}),/tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistry({tenant,integrityResults:[{...integrity,executable:true as false}],priorCertificateIds:[],maxEntries:10}),/unsafe/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistry({tenant,integrityResults:[integrity],priorCertificateIds:[],maxEntries:0}),/unbounded/);
});
