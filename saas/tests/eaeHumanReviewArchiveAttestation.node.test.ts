import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewArchiveAttestation } from '../lib/autonomous-systems/human-review-archive-attestation.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const integrity={schemaVersion:'1.0.0' as const,validationId:'validation-1',tenant,archiveId:'archive-1',disposition:'valid' as const,valid:true,errors:[],validatedArchiveEntryIds:['entry-1'],evidenceRefs:['e2','e1'],truncated:false,readOnly:true as const,executable:false as const};

test('builds deterministic immutable attestations',()=>{
  const request={tenant,integrity,attestorId:'operator-1',statement:'Archive integrity verified.',evidenceRefs:['e3','e1']};
  const a=buildEnterpriseHumanReviewArchiveAttestation(request);
  const b=buildEnterpriseHumanReviewArchiveAttestation(request);
  assert.deepEqual(a,b); assert.equal(a.disposition,'attested'); assert.equal(a.executable,false); assert.ok(Object.isFrozen(a)); assert.deepEqual(a.evidenceRefs,['e1','e2','e3']);
});

test('rejects invalid integrity without granting authority',()=>{
  const result=buildEnterpriseHumanReviewArchiveAttestation({tenant,integrity:{...integrity,disposition:'invalid',valid:false,errors:['duplicate_archive_entry_id']},attestorId:'operator-1',statement:'Integrity validation failed.',evidenceRefs:[]});
  assert.equal(result.disposition,'rejected'); assert.equal(result.readOnly,true); assert.equal(result.executable,false);
});

test('preserves empty disposition',()=>{
  const result=buildEnterpriseHumanReviewArchiveAttestation({tenant,integrity:{...integrity,disposition:'empty',validatedArchiveEntryIds:[]},attestorId:'operator-1',statement:'Archive contains no entries.',evidenceRefs:[]});
  assert.equal(result.disposition,'empty');
});

test('enforces tenant, safety, identity, statement, and bounds',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewArchiveAttestation({tenant:{tenantId:'other',environmentId:'env-a'},integrity,attestorId:'operator-1',statement:'Verified.',evidenceRefs:[]}),/archive_integrity_tenant_boundary_violation/);
  assert.throws(()=>buildEnterpriseHumanReviewArchiveAttestation({tenant,integrity:{...integrity,executable:true as false},attestorId:'operator-1',statement:'Verified.',evidenceRefs:[]}),/unsafe_archive_integrity_result_rejected/);
  assert.throws(()=>buildEnterpriseHumanReviewArchiveAttestation({tenant,integrity,attestorId:' ',statement:'Verified.',evidenceRefs:[]}),/attestor_id_required/);
  assert.throws(()=>buildEnterpriseHumanReviewArchiveAttestation({tenant,integrity,attestorId:'operator-1',statement:' ',evidenceRefs:[]}),/attestation_statement_required/);
  assert.throws(()=>buildEnterpriseHumanReviewArchiveAttestation({tenant,integrity,attestorId:'x'.repeat(257),statement:'Verified.',evidenceRefs:[]}),/unbounded_archive_attestation_rejected/);
});
