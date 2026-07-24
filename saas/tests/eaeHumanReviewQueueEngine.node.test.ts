import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewQueue } from '../lib/autonomous-systems/human-review-queue-engine.ts';
import type { EnterpriseAdaptationProposalSnapshot } from '../lib/autonomous-systems/adaptation-proposal-engine.ts';

const tenant={tenantId:'tenant-a',environmentId:'prod',region:'us'};
const proposalSet:EnterpriseAdaptationProposalSnapshot={schemaVersion:'1.0.0',proposalSetId:'set-1',tenant,feedbackId:'feedback-1',evaluationId:'evaluation-1',disposition:'ready_for_human_review',readOnly:true,executable:false,proposals:[{proposalId:'p-policy',signalId:'s1',target:'policy',action:'hold',rationale:'policy_review',confidence:0.9,requiresHumanApproval:true,executable:false,evidenceRefs:['b','a']},{proposalId:'p-plan',signalId:'s2',target:'plan',action:'adjust',rationale:'plan_review',confidence:0.7,requiresHumanApproval:true,executable:false,evidenceRefs:['c']}],acknowledgedProposalIds:[],evidenceRefs:['root'],truncated:false};
function build(overrides:Partial<Parameters<typeof buildEnterpriseHumanReviewQueue>[0]>={}){return buildEnterpriseHumanReviewQueue({tenant,proposalSet,deferredProposalIds:[],maxItems:16,...overrides});}

test('builds deterministic immutable queues',()=>{const a=build();const b=build();assert.equal(a.queueId,b.queueId);assert.equal(a.disposition,'ready');assert.equal(a.items[0]?.priority,'urgent');assert.equal(a.executable,false);assert.ok(Object.isFrozen(a));assert.ok(Object.isFrozen(a.items[0]));});
test('orders by priority confidence and id',()=>{const result=build();assert.deepEqual(result.items.map(item=>item.proposalId),['p-policy','p-plan']);});
test('preserves blocked and evidence dispositions',()=>{assert.equal(build({proposalSet:{...proposalSet,disposition:'blocked'}}).disposition,'blocked');const evidence={...proposalSet,disposition:'needs_evidence' as const,proposals:[{...proposalSet.proposals[0]!,target:'evidence' as const}]};assert.equal(build({proposalSet:evidence}).disposition,'needs_evidence');});
test('enforces tenant and safety boundaries',()=>{assert.throws(()=>build({tenant:{tenantId:'other',environmentId:'prod'}}),/proposal_set_tenant_boundary_violation/);assert.throws(()=>build({proposalSet:{...proposalSet,executable:true as never}}),/unsafe_proposal_set_rejected/);});
test('supports deterministic deferral',()=>{const result=build({deferredProposalIds:['p-policy']});assert.deepEqual(result.items.map(item=>item.proposalId),['p-plan']);assert.deepEqual(result.deferredProposalIds,['p-policy']);});
test('rejects duplicate deferrals',()=>{assert.throws(()=>build({deferredProposalIds:['p-plan','p-plan']}),/duplicate_deferred_proposal_id/);});
test('bounds queue items',()=>{const result=build({maxItems:1});assert.equal(result.items.length,1);assert.equal(result.truncated,true);assert.throws(()=>build({maxItems:0}),/unbounded_review_queue_rejected/);});
test('sorts and deduplicates evidence',()=>{const result=build();assert.deepEqual(result.items[0]?.evidenceRefs,['a','b']);assert.deepEqual(result.evidenceRefs,['a','b','c','root']);});
