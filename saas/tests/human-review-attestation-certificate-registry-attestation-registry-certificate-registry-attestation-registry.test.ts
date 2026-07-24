import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const valid={schemaVersion:'1.0.0' as const,validationId:'val-1',tenant,attestationId:'att-1',registryId:'reg-1',disposition:'valid' as const,valid:true,errors:[],validatedCertificateIds:['cert-b','cert-a'],evidenceRefs:['z','a'],truncated:false,readOnly:true as const,executable:false as const};

test('builds deterministic immutable registry',()=>{
  const first=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant,integrityResults:[valid],priorAttestationIds:[],maxEntries:10});
  const second=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant,integrityResults:[valid],priorAttestationIds:[],maxEntries:10});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'complete');
  assert.deepEqual(first.entries[0]?.certificateIds,['cert-a','cert-b']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('suppresses prior and duplicate attestations and reports truncation',()=>{
  const duplicate={...valid,validationId:'val-2'};
  const extra={...valid,attestationId:'att-2',validationId:'val-3'};
  const prior=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant,integrityResults:[valid],priorAttestationIds:['att-1'],maxEntries:10});
  assert.equal(prior.entries.length,0);
  assert.deepEqual(prior.rejectedAttestationIds,['att-1']);
  const bounded=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant,integrityResults:[valid,duplicate,extra],priorAttestationIds:[],maxEntries:1});
  assert.equal(bounded.entries.length,1);
  assert.equal(bounded.truncated,true);
  assert.deepEqual(bounded.rejectedAttestationIds,['att-1']);
});

test('maps rejected and empty registries',()=>{
  const rejected=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant,integrityResults:[{...valid,disposition:'invalid' as const,valid:false}],priorAttestationIds:[],maxEntries:10});
  assert.equal(rejected.disposition,'rejected');
  const empty=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant,integrityResults:[],priorAttestationIds:[],maxEntries:10});
  assert.equal(empty.disposition,'empty');
});

test('enforces tenant, safety, and bounds',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant:{tenantId:'other',environmentId:'env-a'},integrityResults:[valid],priorAttestationIds:[],maxEntries:10}),/tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant,integrityResults:[{...valid,executable:true as false}],priorAttestationIds:[],maxEntries:10}),/unsafe/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry({tenant,integrityResults:[valid],priorAttestationIds:[],maxEntries:0}),/unbounded/);
});
