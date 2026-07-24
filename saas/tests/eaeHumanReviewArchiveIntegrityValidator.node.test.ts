import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewArchiveIntegrity } from '../lib/autonomous-systems/human-review-archive-integrity-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const entry={archiveEntryId:'entry-1',closureId:'closure-1',outcomeId:'outcome-1',acknowledgmentRegistryId:'registry-1',disposition:'closed' as const,closedProposalIds:['proposal-1'],pendingProposalIds:[],evidenceRefs:['e2','e1'],readOnly:true as const,executable:false as const};
const archive={schemaVersion:'1.0.0' as const,archiveId:'archive-1',tenant,disposition:'complete' as const,entries:[entry],priorArchiveEntryIds:[],evidenceRefs:['e1'],truncated:false,readOnly:true as const,executable:false as const};

test('validates deterministically and remains immutable',()=>{
  const a=validateEnterpriseHumanReviewArchiveIntegrity({tenant,archive,maxEntries:10});
  const b=validateEnterpriseHumanReviewArchiveIntegrity({tenant,archive,maxEntries:10});
  assert.deepEqual(a,b); assert.equal(a.valid,true); assert.equal(a.disposition,'valid'); assert.equal(a.executable,false); assert.ok(Object.isFrozen(a)); assert.deepEqual(a.evidenceRefs,['e1','e2']);
});

test('fails closed for classification conflicts and duplicates',()=>{
  const badEntry={...entry,pendingProposalIds:['proposal-1']};
  const result=validateEnterpriseHumanReviewArchiveIntegrity({tenant,archive:{...archive,entries:[badEntry,badEntry]},maxEntries:10});
  assert.equal(result.valid,false); assert.equal(result.disposition,'invalid'); assert.deepEqual(result.errors,['duplicate_archive_entry_id','proposal_classification_conflict']);
});

test('enforces tenant, safety, and bounds',()=>{
  assert.throws(()=>validateEnterpriseHumanReviewArchiveIntegrity({tenant:{tenantId:'other',environmentId:'env-a'},archive,maxEntries:10}),/review_archive_tenant_boundary_violation/);
  assert.throws(()=>validateEnterpriseHumanReviewArchiveIntegrity({tenant,archive:{...archive,executable:true as false},maxEntries:10}),/unsafe_review_archive_rejected/);
  assert.throws(()=>validateEnterpriseHumanReviewArchiveIntegrity({tenant,archive,maxEntries:0}),/unbounded_archive_integrity_validation_rejected/);
});

test('reports truncation and validates empty archives',()=>{
  const truncated=validateEnterpriseHumanReviewArchiveIntegrity({tenant,archive:{...archive,entries:[entry,{...entry,archiveEntryId:'entry-2'}]},maxEntries:1});
  assert.equal(truncated.truncated,true); assert.deepEqual(truncated.validatedArchiveEntryIds,['entry-1']);
  const empty=validateEnterpriseHumanReviewArchiveIntegrity({tenant,archive:{...archive,disposition:'empty',entries:[],evidenceRefs:[]},maxEntries:1});
  assert.equal(empty.disposition,'empty'); assert.equal(empty.valid,true);
});
