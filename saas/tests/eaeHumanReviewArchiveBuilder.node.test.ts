import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewArchive } from '../lib/autonomous-systems/human-review-archive-builder.ts';
import type { EnterpriseHumanReviewClosureSnapshot } from '../lib/autonomous-systems/human-review-closure-snapshot.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
function closure(overrides:Partial<EnterpriseHumanReviewClosureSnapshot>={}):EnterpriseHumanReviewClosureSnapshot{return {schemaVersion:'1.0.0',closureId:'closure-1',tenant,outcomeId:'outcome-1',acknowledgmentRegistryId:'registry-1',disposition:'closed',closedProposalIds:['proposal-1'],pendingProposalIds:[],evidenceRefs:['evidence-b','evidence-a'],readOnly:true,executable:false,...overrides};}

test('builds deterministic immutable archive evidence',()=>{
  const request={tenant,closures:[closure()],priorArchiveEntryIds:[],maxEntries:10};
  const a=buildEnterpriseHumanReviewArchive(request);
  const b=buildEnterpriseHumanReviewArchive(request);
  assert.deepEqual(a,b);
  assert.equal(a.disposition,'complete');
  assert.deepEqual(a.evidenceRefs,['evidence-a','evidence-b']);
  assert.equal(a.executable,false);
  assert.equal(Object.isFrozen(a),true);
  assert.equal(Object.isFrozen(a.entries),true);
});

test('preserves partial, blocked, invalid, and empty dispositions',()=>{
  assert.equal(buildEnterpriseHumanReviewArchive({tenant,closures:[closure({disposition:'pending_acknowledgment',pendingProposalIds:['proposal-2']})],priorArchiveEntryIds:[],maxEntries:10}).disposition,'partial');
  assert.equal(buildEnterpriseHumanReviewArchive({tenant,closures:[closure({disposition:'blocked'})],priorArchiveEntryIds:[],maxEntries:10}).disposition,'blocked');
  assert.equal(buildEnterpriseHumanReviewArchive({tenant,closures:[closure({disposition:'invalid'})],priorArchiveEntryIds:[],maxEntries:10}).disposition,'invalid');
  assert.equal(buildEnterpriseHumanReviewArchive({tenant,closures:[],priorArchiveEntryIds:[],maxEntries:10}).disposition,'empty');
});

test('enforces tenant, safety, duplicate, suppression, and bounds',()=>{
  assert.throws(()=>buildEnterpriseHumanReviewArchive({tenant,closures:[closure({tenant:{tenantId:'other',environmentId:'env-a'}})],priorArchiveEntryIds:[],maxEntries:10}),/tenant_boundary/);
  assert.throws(()=>buildEnterpriseHumanReviewArchive({tenant,closures:[{...closure(),executable:true} as unknown as EnterpriseHumanReviewClosureSnapshot],priorArchiveEntryIds:[],maxEntries:10}),/unsafe_review_closure/);
  assert.throws(()=>buildEnterpriseHumanReviewArchive({tenant,closures:[],priorArchiveEntryIds:['x','x'],maxEntries:10}),/duplicate_prior/);
  assert.throws(()=>buildEnterpriseHumanReviewArchive({tenant,closures:[],priorArchiveEntryIds:[],maxEntries:0}),/unbounded/);
  const first=buildEnterpriseHumanReviewArchive({tenant,closures:[closure()],priorArchiveEntryIds:[],maxEntries:10});
  const suppressed=buildEnterpriseHumanReviewArchive({tenant,closures:[closure()],priorArchiveEntryIds:[first.entries[0].archiveEntryId],maxEntries:10});
  assert.equal(suppressed.entries.length,0);
  const bounded=buildEnterpriseHumanReviewArchive({tenant,closures:[closure(),closure({closureId:'closure-2',outcomeId:'outcome-2'})],priorArchiveEntryIds:[],maxEntries:1});
  assert.equal(bounded.entries.length,1);
  assert.equal(bounded.truncated,true);
});
