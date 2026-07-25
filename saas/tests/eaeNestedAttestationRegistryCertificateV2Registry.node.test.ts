import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2Registry } from '../lib/autonomous-systems/human-review-nested-attestation-registry-certificate-v2-registry.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const result=(certificateId:string,certificateSerial:string,valid=true)=>({schemaVersion:'1.0.0' as const,validationId:`validation-${certificateId}`,tenant,certificateId,certificateSerial,registryId:'source-registry',sourceValidationId:'source-validation',issuerId:'issuer-1',disposition:valid?'valid' as const:'invalid' as const,valid,errors:valid?[]:['invalid'],validatedAttestationIds:['b','a'],evidenceRefs:['z','a'],truncated:false,readOnly:true as const,executable:false as const});

 test('builds deterministic immutable normalized registry snapshots',()=>{
  const request={tenant,integrityResults:[result('certificate-b','EAE-HRARR2-BBBBBBBB'),result('certificate-a','EAE-HRARR2-AAAAAAAA')],priorCertificateIds:[],maxEntries:10};
  const first=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2Registry(request);
  const second=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2Registry(request);
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'complete');
  assert.deepEqual(first.entries.map(entry=>entry.certificateId),['certificate-a','certificate-b']);
  assert.deepEqual(first.entries[0]?.attestationIds,['a','b']);
  assert.deepEqual(first.evidenceRefs,['a','z']);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(Object.isFrozen(first.entries),true);
 });

 test('suppresses prior and duplicate certificate identities',()=>{
  const snapshot=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2Registry({tenant,integrityResults:[result('prior','EAE-HRARR2-AAAAAAAA'),result('duplicate','EAE-HRARR2-BBBBBBBB'),result('duplicate','EAE-HRARR2-CCCCCCCC'),result('serial-duplicate','EAE-HRARR2-BBBBBBBB')],priorCertificateIds:['prior'],maxEntries:10});
  assert.equal(snapshot.disposition,'partial');
  assert.deepEqual(snapshot.entries.map(entry=>entry.certificateId),['duplicate']);
  assert.deepEqual(snapshot.rejectedCertificateIds,['duplicate','prior','serial-duplicate']);
 });

 test('reports rejected, empty, and truncated registries',()=>{
  const rejected=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2Registry({tenant,integrityResults:[result('bad','EAE-HRARR2-AAAAAAAA',false)],priorCertificateIds:[],maxEntries:10});
  assert.equal(rejected.disposition,'rejected');
  const empty=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2Registry({tenant,integrityResults:[],priorCertificateIds:[],maxEntries:10});
  assert.equal(empty.disposition,'empty');
  const truncated=buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2Registry({tenant,integrityResults:[result('a','EAE-HRARR2-AAAAAAAA'),result('b','EAE-HRARR2-BBBBBBBB')],priorCertificateIds:[],maxEntries:1});
  assert.equal(truncated.truncated,true);
  assert.equal(truncated.entries.length,1);
 });

 test('fails closed on tenant, safety, and bounds violations',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2Registry({tenant:{tenantId:'other',environmentId:'env-a'},integrityResults:[result('a','EAE-HRARR2-AAAAAAAA')],priorCertificateIds:[],maxEntries:10}),/tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2Registry({tenant,integrityResults:[{...result('a','EAE-HRARR2-AAAAAAAA'),executable:true as false}],priorCertificateIds:[],maxEntries:10}),/unsafe/);
  assert.throws(()=>buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2Registry({tenant,integrityResults:[],priorCertificateIds:[],maxEntries:0}),/unbounded/);
 });
