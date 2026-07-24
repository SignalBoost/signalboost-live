import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewNestedAttestationRegistryCertificate } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const integrity={schemaVersion:'1.0.0' as const,validationId:'val-1',tenant,registryId:'reg-1',disposition:'valid' as const,valid:true,errors:[],validatedAttestationIds:['att-b','att-a'],evidenceRefs:['z','a'],truncated:false,readOnly:true as const,executable:false as const};

test('builds deterministic immutable certificate',()=>{
  const first=buildEnterpriseHumanReviewNestedAttestationRegistryCertificate({tenant,integrity,issuerId:'issuer-1',evidenceRefs:['b','a']});
  const second=buildEnterpriseHumanReviewNestedAttestationRegistryCertificate({tenant,integrity,issuerId:'issuer-1',evidenceRefs:['a','b']});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'certified');
  assert.match(first.certificateSerial,/^EAE-HRARR-[A-F0-9]{8}$/);
  assert.deepEqual(first.attestationIds,['att-a','att-b']);
  assert.deepEqual(first.evidenceRefs,['a','b','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('maps empty and invalid integrity dispositions',()=>{
  const empty=buildEnterpriseHumanReviewNestedAttestationRegistryCertificate({tenant,integrity:{...integrity,disposition:'empty' as const,validatedAttestationIds:[]},issuerId:'issuer-1',evidenceRefs:[]});
  assert.equal(empty.disposition,'empty');
  const rejected=buildEnterpriseHumanReviewNestedAttestationRegistryCertificate({tenant,integrity:{...integrity,disposition:'invalid' as const,valid:false,errors:['bad']},issuerId:'issuer-1',evidenceRefs:[]});
  assert.equal(rejected.disposition,'rejected');
});

test('enforces tenant, safety, and issuer bounds',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificate({tenant:{tenantId:'other',environmentId:'env-a'},integrity,issuerId:'issuer-1',evidenceRefs:[]}),/tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificate({tenant,integrity:{...integrity,executable:true as false},issuerId:'issuer-1',evidenceRefs:[]}),/unsafe/);
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificate({tenant,integrity,issuerId:' ',evidenceRefs:[]}),/issuer_id_required/);
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificate({tenant,integrity,issuerId:'x'.repeat(257),evidenceRefs:[]}),/unbounded/);
});
