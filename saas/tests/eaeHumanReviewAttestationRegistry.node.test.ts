import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewAttestationRegistry } from '../lib/autonomous-systems/human-review-attestation-registry.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const attestation={schemaVersion:'1.0.0' as const,attestationId:'attestation-1',tenant,archiveId:'archive-1',validationId:'validation-1',attestorId:'operator-1',statement:'reviewed',disposition:'attested' as const,evidenceRefs:['e2','e1'],readOnly:true as const,executable:false as const};

test('builds deterministic immutable registry',()=>{
  const request={tenant,attestations:[attestation],priorAttestationIds:[],maxEntries:10};
  const a=buildEnterpriseHumanReviewAttestationRegistry(request);
  const b=buildEnterpriseHumanReviewAttestationRegistry(request);
  assert.deepEqual(a,b); assert.equal(a.disposition,'complete'); assert.equal(a.executable,false); assert.ok(Object.isFrozen(a)); assert.deepEqual(a.evidenceRefs,['e1','e2']);
});

test('suppresses prior attestations and reports empty input',()=>{
  const suppressed=buildEnterpriseHumanReviewAttestationRegistry({tenant,attestations:[attestation],priorAttestationIds:['attestation-1'],maxEntries:10});
  assert.deepEqual(suppressed.entries,[]); assert.equal(suppressed.disposition,'complete');
  const empty=buildEnterpriseHumanReviewAttestationRegistry({tenant,attestations:[],priorAttestationIds:[],maxEntries:1});
  assert.equal(empty.disposition,'empty');
});

test('preserves rejection and truncation dispositions',()=>{
  const rejected={...attestation,attestationId:'attestation-2',disposition:'rejected' as const};
  const result=buildEnterpriseHumanReviewAttestationRegistry({tenant,attestations:[attestation,rejected],priorAttestationIds:[],maxEntries:1});
  assert.equal(result.truncated,true); assert.equal(result.disposition,'partial'); assert.equal(result.entries.length,1);
});

test('enforces tenant, safety, duplicate prior ids, and bounds',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewAttestationRegistry({tenant:{tenantId:'other',environmentId:'env-a'},attestations:[attestation],priorAttestationIds:[],maxEntries:1}),/archive_attestation_tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationRegistry({tenant,attestations:[{...attestation,executable:true as false}],priorAttestationIds:[],maxEntries:1}),/unsafe_archive_attestation_rejected/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationRegistry({tenant,attestations:[attestation],priorAttestationIds:['x','x'],maxEntries:1}),/duplicate_prior_attestation_id/);
  assert.throws(()=>buildEnterpriseHumanReviewAttestationRegistry({tenant,attestations:[attestation],priorAttestationIds:[],maxEntries:0}),/unbounded_attestation_registry_rejected/);
});
