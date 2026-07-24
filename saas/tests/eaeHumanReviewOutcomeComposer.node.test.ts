import assert from 'node:assert/strict';
import test from 'node:test';
import { composeEnterpriseHumanReviewOutcome } from '../lib/autonomous-systems/human-review-outcome-composer.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const entry=(id:string,proposalId:string,decision:'approve'|'reject'|'request_evidence'|'defer',valid=true)=>({entryId:id,decisionSetId:'set-1',decisionId:`decision-${id}`,queueId:'queue-1',proposalId,reviewerId:`reviewer-${id}`,decision,reason:`reason-${id}`,valid,errors:valid?[]:['invalid'],evidenceRefs:[`evidence-${id}`],readOnly:true as const,executable:false as const});
const ledger=(entries:ReturnType<typeof entry>[],disposition:'complete'|'needs_evidence'|'blocked'|'invalid'='complete')=>({schemaVersion:'1.0.0' as const,ledgerId:'ledger-1',tenant,disposition,readOnly:true as const,executable:false as const,entries,priorEntryIds:[],evidenceRefs:['ledger-evidence'],truncated:false});

test('composes deterministic categorized outcomes',()=>{
  const request={tenant,ledger:ledger([entry('a','p1','approve'),entry('b','p2','reject'),entry('c','p3','defer'),entry('d','p4','request_evidence')]),maxItems:10};
  const first=composeEnterpriseHumanReviewOutcome(request);
  const second=composeEnterpriseHumanReviewOutcome(request);
  assert.deepEqual(first,second);
  assert.deepEqual(first.approvedProposalIds,['p1']);
  assert.deepEqual(first.rejectedProposalIds,['p2']);
  assert.deepEqual(first.deferredProposalIds,['p3']);
  assert.deepEqual(first.evidenceRequestedProposalIds,['p4']);
  assert.equal(first.executable,false);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(Object.isFrozen(first.items),true);
});

test('conflicting decisions become invalid evidence requests',()=>{
  const result=composeEnterpriseHumanReviewOutcome({tenant,ledger:ledger([entry('a','p1','approve'),entry('b','p1','reject')]),maxItems:10});
  assert.equal(result.disposition,'invalid');
  assert.equal(result.items[0]?.valid,false);
  assert.deepEqual(result.evidenceRequestedProposalIds,['p1']);
  assert.deepEqual(result.approvedProposalIds,[]);
});

test('preserves blocked and needs-evidence dispositions',()=>{
  assert.equal(composeEnterpriseHumanReviewOutcome({tenant,ledger:ledger([entry('a','p1','reject')],'blocked'),maxItems:10}).disposition,'blocked');
  assert.equal(composeEnterpriseHumanReviewOutcome({tenant,ledger:ledger([entry('a','p1','request_evidence')],'needs_evidence'),maxItems:10}).disposition,'needs_evidence');
});

test('reports empty and bounded outcomes',()=>{
  assert.equal(composeEnterpriseHumanReviewOutcome({tenant,ledger:ledger([]),maxItems:10}).disposition,'empty');
  const bounded=composeEnterpriseHumanReviewOutcome({tenant,ledger:ledger([entry('a','p1','approve'),entry('b','p2','approve')]),maxItems:1});
  assert.equal(bounded.items.length,1);
  assert.equal(bounded.truncated,true);
});

test('rejects tenant and unsafe ledger boundaries',()=>{
  assert.throws(()=>composeEnterpriseHumanReviewOutcome({tenant:{tenantId:'other',environmentId:'env-a'},ledger:ledger([]),maxItems:1}),/tenant_boundary/);
  assert.throws(()=>composeEnterpriseHumanReviewOutcome({tenant,ledger:{...ledger([]),executable:true as false},maxItems:1}),/unsafe_decision_ledger/);
});

test('rejects invalid bounds',()=>{
  assert.throws(()=>composeEnterpriseHumanReviewOutcome({tenant,ledger:ledger([]),maxItems:0}),/unbounded_review_outcome/);
  assert.throws(()=>composeEnterpriseHumanReviewOutcome({tenant,ledger:ledger([]),maxItems:513}),/unbounded_review_outcome/);
});

test('sorts and deduplicates evidence and identities',()=>{
  const duplicate={...entry('b','p1','approve'),reviewerId:'reviewer-a',evidenceRefs:['z','a','z']};
  const result=composeEnterpriseHumanReviewOutcome({tenant,ledger:{...ledger([entry('a','p1','approve'),duplicate]),evidenceRefs:['z','ledger-evidence']},maxItems:10});
  assert.deepEqual(result.items[0]?.reviewerIds,['reviewer-a']);
  assert.deepEqual(result.items[0]?.evidenceRefs,['a','evidence-a','z']);
  assert.deepEqual(result.evidenceRefs,['a','evidence-a','ledger-evidence','z']);
});
