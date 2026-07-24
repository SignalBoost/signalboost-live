import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const valid={schemaVersion:'1.0.0' as const,validationId:'validation-1',tenant,attestationId:'attestation-1',registryId:'registry-1',sourceValidationId:'source-1',attestorId:'attestor-1',disposition:'valid' as const,valid:true,errors:[],validatedCertificateIds:['cert-b','cert-a'],evidenceRefs:['z','a'],truncated:false,readOnly:true as const,executable:false as const};

test('builds a deterministic frozen nested attestation registry',()=>{
  const first=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant,integrityResults:[valid],priorAttestationIds:[],maxEntries:10});
  const second=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant,integrityResults:[valid],priorAttestationIds:[],maxEntries:10});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'complete');
  assert.deepEqual(first.entries[0]?.certificateIds,['cert-a','cert-b']);
  assert.deepEqual(first.evidenceRefs,['a','z']);
  assert.equal(Object.isFrozen(first),true);
});

test('rejects duplicate and prior attestations and reports truncation',()=>{
  const duplicate={...valid};
  const other={...valid,attestationId:'attestation-2',validationId:'validation-2'};
  const registry=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant,integrityResults:[valid,duplicate,other],priorAttestationIds:[],maxEntries:1});
  assert.deepEqual(registry.rejectedAttestationIds,['attestation-1']);
  assert.equal(registry.disposition,'partial');
  assert.equal(registry.truncated,true);
  const prior=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant,integrityResults:[valid],priorAttestationIds:['attestation-1'],maxEntries:10});
  assert.deepEqual(prior.rejectedAttestationIds,['attestation-1']);
});

test('enforces tenant, safety, and bounds',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant:{tenantId:'other',environmentId:'env-a'},integrityResults:[valid],priorAttestationIds:[],maxEntries:10}),/tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant,integrityResults:[{...valid,executable:true as false}],priorAttestationIds:[],maxEntries:10}),/unsafe/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant,integrityResults:[],priorAttestationIds:[],maxEntries:0}),/unbounded/);
});
