import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistry } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const valid={schemaVersion:'1.0.0' as const,validationId:'val-1',tenant,attestationId:'att-b',registryId:'reg-1',disposition:'valid' as const,valid:true,errors:[],validatedCertificateIds:['cert-b','cert-a'],evidenceRefs:['z','a'],truncated:false,readOnly:true as const,executable:false as const};

 test('builds deterministic immutable registry',()=>{
  const first=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistry({tenant,integrityResults:[valid,{...valid,attestationId:'att-a',validationId:'val-2'}],priorAttestationIds:[],maxEntries:10});
  const second=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistry({tenant,integrityResults:[valid,{...valid,attestationId:'att-a',validationId:'val-2'}],priorAttestationIds:[],maxEntries:10});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'complete');
  assert.deepEqual(first.entries.map(entry=>entry.attestationId),['att-a','att-b']);
  assert.deepEqual(first.evidenceRefs,['a','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(Object.isFrozen(first.entries),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('suppresses prior and duplicate attestations and reports truncation',()=>{
  const result=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistry({tenant,integrityResults:[valid,{...valid},{...valid,attestationId:'att-c',validationId:'val-3'}],priorAttestationIds:['att-b'],maxEntries:1});
  assert.deepEqual(result.entries.map(entry=>entry.attestationId),['att-c']);
  assert.deepEqual(result.rejectedAttestationIds,['att-b']);
  assert.equal(result.truncated,true);
  assert.equal(result.disposition,'partial');
});

test('supports rejected and empty registries',()=>{
  const rejected=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistry({tenant,integrityResults:[{...valid,disposition:'invalid' as const,valid:false,errors:['bad']}],priorAttestationIds:[],maxEntries:10});
  assert.equal(rejected.disposition,'rejected');
  const empty=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistry({tenant,integrityResults:[],priorAttestationIds:[],maxEntries:10});
  assert.equal(empty.disposition,'empty');
});

test('enforces tenant, safety, and bounds',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistry({tenant:{tenantId:'other',environmentId:'env-a'},integrityResults:[valid],priorAttestationIds:[],maxEntries:10}),/tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistry({tenant,integrityResults:[{...valid,executable:true as false}],priorAttestationIds:[],maxEntries:10}),/unsafe_certificate_registry_attestation_integrity_rejected/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistry({tenant,integrityResults:[valid],priorAttestationIds:[],maxEntries:0}),/unbounded/);
});
