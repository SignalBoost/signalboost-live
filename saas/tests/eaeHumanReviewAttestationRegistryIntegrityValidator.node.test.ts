import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewAttestationRegistryIntegrity } from '../lib/autonomous-systems/human-review-attestation-registry-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const entry={attestationId:'attestation-1',archiveId:'archive-1',validationId:'validation-1',attestorId:'operator-1',disposition:'attested' as const,evidenceRefs:['e2','e1'],readOnly:true as const,executable:false as const};
const registry={schemaVersion:'1.0.0' as const,registryId:'registry-1',tenant,disposition:'complete' as const,entries:[entry],priorAttestationIds:[],evidenceRefs:['e1'],truncated:false,readOnly:true as const,executable:false as const};

test('validates deterministically and remains immutable',()=>{
  const a=validateEnterpriseHumanReviewAttestationRegistryIntegrity({tenant,registry,maxEntries:10});
  const b=validateEnterpriseHumanReviewAttestationRegistryIntegrity({tenant,registry,maxEntries:10});
  assert.deepEqual(a,b); assert.equal(a.valid,true); assert.equal(a.disposition,'valid'); assert.equal(a.executable,false); assert.ok(Object.isFrozen(a)); assert.deepEqual(a.evidenceRefs,['e1','e2']);
});

test('fails closed for duplicates and disposition conflicts',()=>{
  const rejected={...entry,disposition:'rejected' as const};
  const result=validateEnterpriseHumanReviewAttestationRegistryIntegrity({tenant,registry:{...registry,entries:[rejected,rejected]},maxEntries:10});
  assert.equal(result.valid,false); assert.deepEqual(result.errors,['complete_registry_contains_non_attested_entry','duplicate_attestation_id']);
});

test('enforces tenant, safety, identity, and bounds',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewAttestationRegistryIntegrity({tenant:{tenantId:'other',environmentId:'env-a'},registry,maxEntries:10}),/attestation_registry_tenant_boundary_violation/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationRegistryIntegrity({tenant,registry:{...registry,executable:true as false},maxEntries:10}),/unsafe_attestation_registry_rejected/);
  assert.throws(()=>validateEnterpriseHumanReviewAttestationRegistryIntegrity({tenant,registry,maxEntries:0}),/unbounded_attestation_registry_integrity_validation_rejected/);
  const invalid=validateEnterpriseHumanReviewAttestationRegistryIntegrity({tenant,registry:{...registry,entries:[{...entry,attestorId:''}]},maxEntries:10});
  assert.deepEqual(invalid.errors,['attestation_registry_entry_identity_required']);
});

test('reports truncation and validates empty registries',()=>{
  const truncated=validateEnterpriseHumanReviewAttestationRegistryIntegrity({tenant,registry:{...registry,entries:[entry,{...entry,attestationId:'attestation-2'}]},maxEntries:1});
  assert.equal(truncated.truncated,true); assert.deepEqual(truncated.validatedAttestationIds,['attestation-1']);
  const empty=validateEnterpriseHumanReviewAttestationRegistryIntegrity({tenant,registry:{...registry,disposition:'empty',entries:[],evidenceRefs:[]},maxEntries:1});
  assert.equal(empty.disposition,'empty'); assert.equal(empty.valid,true);
});
