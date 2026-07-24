import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewAttestationCertificate } from '../lib/autonomous-systems/human-review-attestation-certificate.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const integrity={schemaVersion:'1.0.0' as const,validationId:'validation-1',tenant,registryId:'registry-1',disposition:'valid' as const,valid:true,errors:[],validatedAttestationIds:['attestation-2','attestation-1'],evidenceRefs:['e2','e1'],truncated:false,readOnly:true as const,executable:false as const};

test('builds deterministic immutable certificate',()=>{
  const request={tenant,integrity,issuerId:' issuer-1 ',certificateLabel:' Human review archive ',evidenceRefs:['e3','e1']};
  const a=buildEnterpriseHumanReviewAttestationCertificate(request);
  const b=buildEnterpriseHumanReviewAttestationCertificate(request);
  assert.deepEqual(a,b); assert.equal(a.disposition,'certified'); assert.match(a.certificateSerial,/^EAE-HRAC-[0-9A-F]{8}$/); assert.deepEqual(a.attestationIds,['attestation-1','attestation-2']); assert.deepEqual(a.evidenceRefs,['e1','e2','e3']); assert.equal(a.executable,false); assert.ok(Object.isFrozen(a));
});

test('rejects invalid integrity and preserves empty disposition',()=>{
  const rejected=buildEnterpriseHumanReviewAttestationCertificate({tenant,integrity:{...integrity,valid:false,disposition:'invalid',errors:['bad']},issuerId:'issuer',certificateLabel:'label',evidenceRefs:[]});
  assert.equal(rejected.disposition,'rejected');
  const empty=buildEnterpriseHumanReviewAttestationCertificate({tenant,integrity:{...integrity,disposition:'empty',validatedAttestationIds:[]},issuerId:'issuer',certificateLabel:'label',evidenceRefs:[]});
  assert.equal(empty.disposition,'empty');
});

test('enforces tenant, safety, required fields, and bounds',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificate({tenant:{tenantId:'other',environmentId:'env-a'},integrity,issuerId:'issuer',certificateLabel:'label',evidenceRefs:[]}),/attestation_registry_integrity_tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificate({tenant,integrity:{...integrity,executable:true as false},issuerId:'issuer',certificateLabel:'label',evidenceRefs:[]}),/unsafe_attestation_registry_integrity_rejected/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificate({tenant,integrity,issuerId:' ',certificateLabel:'label',evidenceRefs:[]}),/certificate_issuer_id_required/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificate({tenant,integrity,issuerId:'issuer',certificateLabel:' ',evidenceRefs:[]}),/certificate_label_required/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificate({tenant,integrity,issuerId:'x'.repeat(257),certificateLabel:'label',evidenceRefs:[]}),/unbounded_attestation_certificate_rejected/);
});
