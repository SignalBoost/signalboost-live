import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEnterpriseHumanReviewClosureSnapshot } from '../lib/autonomous-systems/human-review-closure-snapshot.ts';

const tenant={tenantId:'tenant-a',environmentId:'env-a'};
const outcome={schemaVersion:'1.0.0',outcomeId:'outcome-1',tenant,ledgerId:'ledger-1',disposition:'complete',readOnly:true,executable:false,approvedProposalIds:['p1','p2'],rejectedProposalIds:[],evidenceRequestedProposalIds:[],deferredProposalIds:[],items:[{proposalId:'p1',decision:'approve',reviewerIds:['r1'],ledgerEntryIds:['e1'],reasons:['ok'],valid:true,evidenceRefs:['ev1'],executable:false},{proposalId:'p2',decision:'approve',reviewerIds:['r2'],ledgerEntryIds:['e2'],reasons:['ok'],valid:true,evidenceRefs:['ev2'],executable:false}],evidenceRefs:['ev2','ev1'],truncated:false} as const;
const registry={schemaVersion:'1.0.0',registryId:'registry-1',tenant,outcomeId:'outcome-1',disposition:'complete',readOnly:true,executable:false,records:[],unacknowledgedProposalIds:[],priorAcknowledgmentIds:[],evidenceRefs:['ack1'],truncated:false} as const;

test('builds deterministic immutable closed snapshot',()=>{
  const first=buildEnterpriseHumanReviewClosureSnapshot({tenant,outcome,acknowledgmentRegistry:registry});
  const second=buildEnterpriseHumanReviewClosureSnapshot({tenant,outcome,acknowledgmentRegistry:registry});
  assert.deepEqual(first,second);
  assert.equal(first.disposition,'closed');
  assert.deepEqual(first.closedProposalIds,['p1','p2']);
  assert.deepEqual(first.evidenceRefs,['ack1','ev1','ev2']);
  assert.equal(first.executable,false);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.closedProposalIds));
});

test('keeps incomplete acknowledgment cycles pending',()=>{
  const partial={...registry,registryId:'registry-2',disposition:'partial',unacknowledgedProposalIds:['p2']} as const;
  const snapshot=buildEnterpriseHumanReviewClosureSnapshot({tenant,outcome,acknowledgmentRegistry:partial});
  assert.equal(snapshot.disposition,'pending_acknowledgment');
  assert.deepEqual(snapshot.closedProposalIds,['p1']);
  assert.deepEqual(snapshot.pendingProposalIds,['p2']);
});

test('fails closed for blocked, invalid, mismatched, and cross-tenant inputs',()=>{
  assert.equal(buildEnterpriseHumanReviewClosureSnapshot({tenant,outcome:{...outcome,disposition:'blocked'},acknowledgmentRegistry:{...registry,disposition:'blocked'}}).disposition,'blocked');
  assert.equal(buildEnterpriseHumanReviewClosureSnapshot({tenant,outcome:{...outcome,disposition:'invalid'},acknowledgmentRegistry:{...registry,disposition:'invalid'}}).disposition,'invalid');
  assert.throws(()=>buildEnterpriseHumanReviewClosureSnapshot({tenant,outcome,acknowledgmentRegistry:{...registry,outcomeId:'other'}}),/acknowledgment_registry_outcome_mismatch/);
  assert.throws(()=>buildEnterpriseHumanReviewClosureSnapshot({tenant,outcome,acknowledgmentRegistry:{...registry,tenant:{tenantId:'tenant-b',environmentId:'env-a'}}}),/tenant_boundary_violation/);
});

test('reports empty cycles without inventing closure work',()=>{
  const emptyOutcome={...outcome,outcomeId:'outcome-empty',items:[],approvedProposalIds:[],evidenceRefs:[],disposition:'empty'} as const;
  const emptyRegistry={...registry,registryId:'registry-empty',outcomeId:'outcome-empty',disposition:'empty',evidenceRefs:[]} as const;
  const snapshot=buildEnterpriseHumanReviewClosureSnapshot({tenant,outcome:emptyOutcome,acknowledgmentRegistry:emptyRegistry});
  assert.equal(snapshot.disposition,'empty');
  assert.deepEqual(snapshot.closedProposalIds,[]);
  assert.deepEqual(snapshot.pendingProposalIds,[]);
});
