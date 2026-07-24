import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryIntegrity } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'prod'};
const entry={certificateId:'cert-1',certificateSerial:'EAE-HRARR-ABC12345',sourceRegistryId:'source-registry',validationId:'validation-1',issuerId:'issuer-1',disposition:'valid' as const,valid:true,attestationIds:['att-1'],evidenceRefs:['evidence-1'],readOnly:true as const,executable:false as const};
const registry={schemaVersion:'1.0.0' as const,registryId:'registry-1',tenant,disposition:'complete' as const,entries:[entry],priorCertificateIds:[],rejectedCertificateIds:[],evidenceRefs:['registry-evidence'],truncated:false,readOnly:true as const,executable:false as const};

test('validates a safe deterministic certificate registry snapshot',()=>{
  const first=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryIntegrity({tenant,registry,maxEntries:8});
  const second=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryIntegrity({tenant,registry,maxEntries:8});
  assert.equal(first.valid,true);
  assert.equal(first.disposition,'valid');
  assert.deepEqual(first.validatedCertificateIds,['cert-1']);
  assert.deepEqual(first.evidenceRefs,['evidence-1','registry-evidence']);
  assert.equal(first.validationId,second.validationId);
  assert.equal(first.readOnly,true);
  assert.equal(first.executable,false);
  assert.equal(Object.isFrozen(first),true);
});

test('rejects duplicate certificate identities and inconsistent complete disposition',()=>{
  const duplicate={...entry,validationId:'validation-2',valid:false,disposition:'invalid' as const};
  const result=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryIntegrity({tenant,registry:{...registry,entries:[entry,duplicate]},maxEntries:8});
  assert.equal(result.valid,false);
  assert.equal(result.disposition,'invalid');
  assert.deepEqual(result.errors,['complete_nested_attestation_registry_certificate_registry_contains_invalid_entry','duplicate_certificate_id','duplicate_certificate_serial']);
});

test('enforces tenant boundary and bounded validation',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryIntegrity({tenant:{tenantId:'tenant-b',environmentId:'prod'},registry,maxEntries:8}),/tenant_boundary_violation/);
  assert.throws(()=>validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryIntegrity({tenant,registry,maxEntries:0}),/unbounded_nested_attestation_registry_certificate_registry_integrity_validation_rejected/);
  const result=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryIntegrity({tenant,registry:{...registry,entries:[entry,{...entry,certificateId:'cert-2',certificateSerial:'EAE-HRARR-DEF67890'}]},maxEntries:1});
  assert.equal(result.truncated,true);
  assert.deepEqual(result.validatedCertificateIds,['cert-1']);
});
