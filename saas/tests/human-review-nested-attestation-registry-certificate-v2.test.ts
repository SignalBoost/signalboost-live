import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2 } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const integrity={schemaVersion:'1.0.0' as const,validationId:'validation-1',tenant,registryId:'registry-1',disposition:'valid' as const,valid:true,errors:[],validatedAttestationIds:['attestation-b','attestation-a'],evidenceRefs:['z','a'],truncated:false,readOnly:true as const,executable:false as const};

test('builds a deterministic frozen certificate',()=>{
  const first=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2({tenant,integrity,issuerId:' issuer-1 ',evidenceRefs:['m','a']});
  const second=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2({tenant,integrity,issuerId:'issuer-1',evidenceRefs:['a','m']});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'certified');
  assert.deepEqual(first.attestationIds,['attestation-a','attestation-b']);
  assert.deepEqual(first.evidenceRefs,['a','m','z']);
  assert.equal(Object.isFrozen(first),true);
});

test('maps invalid and empty integrity dispositions',()=>{
  const rejected=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2({tenant,integrity:{...integrity,disposition:'invalid',valid:false},issuerId:'issuer-1',evidenceRefs:[]});
  assert.equal(rejected.disposition,'rejected');
  const empty=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2({tenant,integrity:{...integrity,disposition:'empty',validatedAttestationIds:[]},issuerId:'issuer-1',evidenceRefs:[]});
  assert.equal(empty.disposition,'empty');
});

test('enforces tenant, safety, and issuer bounds',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2({tenant:{tenantId:'other',environmentId:'env-a'},integrity,issuerId:'issuer-1',evidenceRefs:[]}),/tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2({tenant,integrity:{...integrity,executable:true as false},issuerId:'issuer-1',evidenceRefs:[]}),/unsafe/);
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2({tenant,integrity,issuerId:' ',evidenceRefs:[]}),/issuer_id_required/);
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2({tenant,integrity,issuerId:'x'.repeat(257),evidenceRefs:[]}),/unbounded/);
});
