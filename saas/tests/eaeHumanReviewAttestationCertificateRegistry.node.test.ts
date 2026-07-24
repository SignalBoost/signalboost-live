import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewAttestationCertificateRegistry } from '../lib/autonomous-systems/human-review-attestation-certificate-registry.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const certificate={schemaVersion:'1.0.0' as const,validationId:'validation-1',tenant,certificateId:'certificate-1',certificateSerial:'EAE-HRAC-ABCDEF12',disposition:'valid' as const,valid:true,errors:[],validatedAttestationIds:['attestation-2','attestation-1'],evidenceRefs:['evidence-2','evidence-1'],truncated:false,readOnly:true as const,executable:false as const};

test('builds a deterministic immutable certificate registry',()=>{
  const request={tenant,certificates:[certificate],priorCertificateIds:[],maxEntries:10};
  const first=buildEnterpriseHumanReviewAttestationCertificateRegistry(request);
  const second=buildEnterpriseHumanReviewAttestationCertificateRegistry(request);
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'complete');
  assert.deepEqual(first.entries[0]?.attestationIds,['attestation-1','attestation-2']);
  assert.deepEqual(first.evidenceRefs,['evidence-1','evidence-2']);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(Object.isFrozen(first.entries),true);
});

test('suppresses prior certificates and reports empty input',()=>{
  const suppressed=buildEnterpriseHumanReviewAttestationCertificateRegistry({tenant,certificates:[certificate],priorCertificateIds:['certificate-1'],maxEntries:10});
  assert.equal(suppressed.entries.length,0);
  const empty=buildEnterpriseHumanReviewAttestationCertificateRegistry({tenant,certificates:[],priorCertificateIds:[],maxEntries:10});
  assert.equal(empty.disposition,'empty');
});

test('reports rejected and truncated registries',()=>{
  const invalid={...certificate,certificateId:'certificate-2',certificateSerial:'EAE-HRAC-00000000',validationId:'validation-2',disposition:'invalid' as const,valid:false,errors:['invalid']};
  const rejected=buildEnterpriseHumanReviewAttestationCertificateRegistry({tenant,certificates:[invalid],priorCertificateIds:[],maxEntries:10});
  assert.equal(rejected.disposition,'rejected');
  const truncated=buildEnterpriseHumanReviewAttestationCertificateRegistry({tenant,certificates:[certificate,{...certificate,certificateId:'certificate-2',validationId:'validation-2'}],priorCertificateIds:[],maxEntries:1});
  assert.equal(truncated.disposition,'partial');
  assert.equal(truncated.truncated,true);
});

test('enforces tenant, safety, duplicate, and bounded-input boundaries',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistry({tenant,certificates:[{...certificate,tenant:{tenantId:'other',environmentId:'env-a'}}],priorCertificateIds:[],maxEntries:10}),/tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistry({tenant,certificates:[{...certificate,executable:true as false}],priorCertificateIds:[],maxEntries:10}),/unsafe_attestation_certificate_integrity_rejected/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistry({tenant,certificates:[certificate,certificate],priorCertificateIds:[],maxEntries:10}),/duplicate_certificate_id/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistry({tenant,certificates:[],priorCertificateIds:['x','x'],maxEntries:10}),/duplicate_prior_certificate_id/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistry({tenant,certificates:[],priorCertificateIds:[],maxEntries:0}),/unbounded_attestation_certificate_registry_rejected/);
});
