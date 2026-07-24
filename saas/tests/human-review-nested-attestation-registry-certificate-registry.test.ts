import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistry } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry.ts';
import type { EnterpriseHumanReviewNestedAttestationRegistryCertificateIntegrityResult } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'prod'};
function result(overrides:Partial<EnterpriseHumanReviewNestedAttestationRegistryCertificateIntegrityResult>={}):EnterpriseHumanReviewNestedAttestationRegistryCertificateIntegrityResult {
  return {schemaVersion:'1.0.0',validationId:'validation-1',tenant,certificateId:'certificate-1',certificateSerial:'EAE-HRARR-ABC12345',registryId:'source-registry-1',sourceValidationId:'source-validation-1',issuerId:'issuer-1',disposition:'valid',valid:true,errors:[],validatedAttestationIds:['attestation-2','attestation-1'],evidenceRefs:['evidence-2','evidence-1'],truncated:false,readOnly:true,executable:false,...overrides};
}

test('builds deterministic normalized read-only certificate registry',()=>{
  const request={tenant,integrityResults:[result()],priorCertificateIds:[],maxEntries:10};
  const first=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistry(request);
  const second=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistry(request);
  assert.equal(first.registryId,second.registryId);
  assert.equal(first.disposition,'complete');
  assert.deepEqual(first.entries[0]?.attestationIds,['attestation-1','attestation-2']);
  assert.deepEqual(first.evidenceRefs,['evidence-1','evidence-2']);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
  assert.equal(Object.isFrozen(first),true);
});

test('suppresses duplicate and prior certificates and reports partial disposition',()=>{
  const snapshot=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistry({tenant,integrityResults:[result(),result({validationId:'validation-2'}),result({certificateId:'certificate-2',certificateSerial:'EAE-HRARR-DEF67890',validationId:'validation-3',valid:false,disposition:'invalid'})],priorCertificateIds:['certificate-prior'],maxEntries:10});
  assert.equal(snapshot.entries.length,2);
  assert.deepEqual(snapshot.rejectedCertificateIds,['certificate-1']);
  assert.equal(snapshot.disposition,'partial');
});

test('enforces tenant, safety, and bounded-entry constraints',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistry({tenant,integrityResults:[result({tenant:{tenantId:'tenant-b',environmentId:'prod'}})],priorCertificateIds:[],maxEntries:1}),/tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistry({tenant,integrityResults:[result({readOnly:false as true})],priorCertificateIds:[],maxEntries:1}),/unsafe_nested_attestation_registry_certificate_integrity_rejected/);
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistry({tenant,integrityResults:[],priorCertificateIds:[],maxEntries:513}),/unbounded_nested_attestation_registry_certificate_registry_rejected/);
});

test('reports truncation when eligible results exceed the bound',()=>{
  const snapshot=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistry({tenant,integrityResults:[result(),result({certificateId:'certificate-2',certificateSerial:'EAE-HRARR-DEF67890',validationId:'validation-2'})],priorCertificateIds:[],maxEntries:1});
  assert.equal(snapshot.entries.length,1);
  assert.equal(snapshot.truncated,true);
});
