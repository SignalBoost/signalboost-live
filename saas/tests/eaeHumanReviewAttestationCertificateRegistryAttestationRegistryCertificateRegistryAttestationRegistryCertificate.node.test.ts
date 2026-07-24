import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificate } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const integrity={schemaVersion:'1.0.0' as const,validationId:'val-1',tenant,registryId:'reg-1',disposition:'valid' as const,valid:true,errors:[],validatedAttestationIds:['att-b','att-a'],evidenceRefs:['z','a'],truncated:false,readOnly:true as const,executable:false as const};

test('builds deterministically and freezes output',()=>{
  const first=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificate({tenant,integrity,issuerId:' issuer-1 ',evidenceRefs:['b','a']});
  const second=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificate({tenant,integrity,issuerId:'issuer-1',evidenceRefs:['a','b']});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'certified');
  assert.match(first.certificateSerial,/^EAE-HRARR-[0-9A-F]{8}$/);
  assert.deepEqual(first.attestationIds,['att-a','att-b']);
  assert.deepEqual(first.evidenceRefs,['a','b','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
});

test('maps invalid and empty integrity dispositions',()=>{
  const rejected=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificate({tenant,integrity:{...integrity,disposition:'invalid' as const,valid:false},issuerId:'issuer-1',evidenceRefs:[]});
  assert.equal(rejected.disposition,'rejected');
  const empty=buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificate({tenant,integrity:{...integrity,disposition:'empty' as const,validatedAttestationIds:[]},issuerId:'issuer-1',evidenceRefs:[]});
  assert.equal(empty.disposition,'empty');
});

test('enforces tenant, safety, issuer, and bounds',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificate({tenant:{tenantId:'other',environmentId:'env-a'},integrity,issuerId:'issuer-1',evidenceRefs:[]}),/tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificate({tenant,integrity:{...integrity,executable:true as false},issuerId:'issuer-1',evidenceRefs:[]}),/unsafe/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificate({tenant,integrity,issuerId:' ',evidenceRefs:[]}),/issuer_id_required/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificate({tenant,integrity,issuerId:'x'.repeat(257),evidenceRefs:[]}),/unbounded/);
});
