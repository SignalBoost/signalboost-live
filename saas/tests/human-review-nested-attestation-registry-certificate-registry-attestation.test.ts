import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestation } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation.ts';

const tenant={tenantId:'tenant-a',environmentId:'prod'};
const integrity={schemaVersion:'1.0.0' as const,validationId:'validation-1',tenant,registryId:'registry-1',disposition:'valid' as const,valid:true,errors:[],validatedCertificateIds:['cert-2','cert-1','cert-1'],evidenceRefs:['evidence-2','evidence-1'],truncated:false,readOnly:true as const,executable:false as const};

test('builds a deterministic immutable attestation',()=>{
  const request={tenant,integrity,attestorId:' attestor-1 ',evidenceRefs:['evidence-3','evidence-1']};
  const first=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestation(request);
  const second=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestation(request);
  assert.equal(first.attestationId,second.attestationId);
  assert.equal(first.attestorId,'attestor-1');
  assert.equal(first.disposition,'attested');
  assert.deepEqual(first.certificateIds,['cert-1','cert-2']);
  assert.deepEqual(first.evidenceRefs,['evidence-1','evidence-2','evidence-3']);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(Object.isFrozen(first.certificateIds),true);
});

test('maps empty and invalid integrity dispositions safely',()=>{
  const empty=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestation({tenant,integrity:{...integrity,disposition:'empty',valid:true,validatedCertificateIds:[]},attestorId:'attestor-1',evidenceRefs:[]});
  const rejected=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestation({tenant,integrity:{...integrity,disposition:'invalid',valid:false,errors:['bad']},attestorId:'attestor-1',evidenceRefs:[]});
  assert.equal(empty.disposition,'empty');
  assert.equal(rejected.disposition,'rejected');
});

test('enforces tenant, safety, and attestor bounds',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestation({tenant:{tenantId:'tenant-b',environmentId:'prod'},integrity,attestorId:'attestor-1',evidenceRefs:[]}),/tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestation({tenant,integrity,attestorId:'   ',evidenceRefs:[]}),/attestor_id_required/);
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestation({tenant,integrity,attestorId:'x'.repeat(257),evidenceRefs:[]}),/unbounded_nested_attestation_registry_certificate_registry_attestation_rejected/);
});
