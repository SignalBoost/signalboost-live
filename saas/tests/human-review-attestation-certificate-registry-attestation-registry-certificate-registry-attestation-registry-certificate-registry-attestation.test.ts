import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestation } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const integrity={schemaVersion:'1.0.0' as const,validationId:'val-1',tenant,registryId:'reg-1',disposition:'valid' as const,valid:true,errors:[],validatedCertificateIds:['cert-b','cert-a'],evidenceRefs:['z','a'],truncated:false,readOnly:true as const,executable:false as const};

test('builds deterministically and freezes output',()=>{
  const request={tenant,integrity,attestorId:'attestor-1',evidenceRefs:['extra','a']};
  const first=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestation(request);
  const second=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestation(request);
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'attested');
  assert.deepEqual(first.certificateIds,['cert-a','cert-b']);
  assert.deepEqual(first.evidenceRefs,['a','extra','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('maps invalid and empty integrity dispositions',()=>{
  const rejected=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestation({tenant,integrity:{...integrity,disposition:'invalid' as const,valid:false,errors:['bad']},attestorId:'attestor-1',evidenceRefs:[]});
  assert.equal(rejected.disposition,'rejected');
  const empty=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestation({tenant,integrity:{...integrity,disposition:'empty' as const,validatedCertificateIds:[]},attestorId:'attestor-1',evidenceRefs:[]});
  assert.equal(empty.disposition,'empty');
});

test('enforces tenant, safety, attestor, and bounds',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestation({tenant:{tenantId:'other',environmentId:'env-a'},integrity,attestorId:'attestor-1',evidenceRefs:[]}),/tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestation({tenant,integrity:{...integrity,executable:true as false},attestorId:'attestor-1',evidenceRefs:[]}),/unsafe/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestation({tenant,integrity,attestorId:'',evidenceRefs:[]}),/attestor_id_required/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestation({tenant,integrity,attestorId:'x'.repeat(257),evidenceRefs:[]}),/unbounded/);
});
