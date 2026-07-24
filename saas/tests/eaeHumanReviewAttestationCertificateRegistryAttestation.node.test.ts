import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewAttestationCertificateRegistryAttestation } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const integrity={schemaVersion:'1.0.0',validationId:'validation-1',tenant,registryId:'registry-1',disposition:'valid' as const,valid:true,errors:[],validatedCertificateIds:['certificate-b','certificate-a'],evidenceRefs:['evidence-b','evidence-a'],truncated:false,readOnly:true as const,executable:false as const};

test('builds deterministic immutable certificate registry attestation',()=>{
  const request={tenant,integrity,attestorId:' reviewer-1 ',statement:' reviewed ',evidenceRefs:['evidence-c','evidence-a']};
  const first=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestation(request);
  const second=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestation(request);
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'attested');
  assert.deepEqual(first.certificateIds,['certificate-a','certificate-b']);
  assert.deepEqual(first.evidenceRefs,['evidence-a','evidence-b','evidence-c']);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.certificateIds));
});

test('maps invalid and empty integrity dispositions',()=>{
  const rejected=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestation({tenant,integrity:{...integrity,valid:false,disposition:'invalid'},attestorId:'reviewer',statement:'rejected',evidenceRefs:[]});
  assert.equal(rejected.disposition,'rejected');
  const empty=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestation({tenant,integrity:{...integrity,disposition:'empty',validatedCertificateIds:[]},attestorId:'reviewer',statement:'empty',evidenceRefs:[]});
  assert.equal(empty.disposition,'empty');
});

test('rejects tenant, safety, required-field, and bound violations',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestation({tenant:{...tenant,tenantId:'tenant-b'},integrity,attestorId:'reviewer',statement:'ok',evidenceRefs:[]}),/tenant_boundary/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestation({tenant,integrity:{...integrity,executable:true as false},attestorId:'reviewer',statement:'ok',evidenceRefs:[]}),/unsafe/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestation({tenant,integrity,attestorId:' ',statement:'ok',evidenceRefs:[]}),/attestor_id_required/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestation({tenant,integrity,attestorId:'reviewer',statement:' ',evidenceRefs:[]}),/attestation_statement_required/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestation({tenant,integrity,attestorId:'x'.repeat(257),statement:'ok',evidenceRefs:[]}),/unbounded/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestation({tenant,integrity,attestorId:'reviewer',statement:'x'.repeat(2049),evidenceRefs:[]}),/unbounded/);
});
