import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseHumanReviewDecisions } from '../lib/autonomous-systems/human-review-decision-validator.ts';
import type { EnterpriseHumanReviewQueueSnapshot } from '../lib/autonomous-systems/human-review-queue-engine.ts';

const tenant={tenantId:'tenant-a',environmentId:'prod',region:'us'};
const queue:EnterpriseHumanReviewQueueSnapshot={schemaVersion:'1.0.0',queueId:'queue-1',tenant,proposalSetId:'set-1',disposition:'ready',readOnly:true,executable:false,items:[{queueItemId:'item-1',proposalId:'proposal-1',target:'plan',priority:'high',rationale:'review',confidence:0.8,requiresHumanApproval:true,executable:false,evidenceRefs:['b','a']}],deferredProposalIds:[],evidenceRefs:['root'],truncated:false};
const attestation={queueItemId:'item-1',proposalId:'proposal-1',reviewerId:'reviewer-1',decision:'approve' as const,reason:'bounded change accepted',evidenceRefs:['c','a']};
function build(overrides:Partial<Parameters<typeof validateEnterpriseHumanReviewDecisions>[0]>={}){return validateEnterpriseHumanReviewDecisions({tenant,queue,attestations:[attestation],maxDecisions:16,...overrides});}

test('builds deterministic immutable decision evidence',()=>{const a=build();const b=build();assert.equal(a.decisionSetId,b.decisionSetId);assert.equal(a.disposition,'valid');assert.equal(a.decisions[0]?.valid,true);assert.equal(a.executable,false);assert.ok(Object.isFrozen(a));assert.ok(Object.isFrozen(a.decisions[0]));});
test('rejects tenant and safety boundary violations',()=>{assert.throws(()=>build({tenant:{tenantId:'other',environmentId:'prod'}}),/review_queue_tenant_boundary_violation/);assert.throws(()=>build({queue:{...queue,executable:true as never}}),/unsafe_review_queue_rejected/);});
test('detects unknown items and proposal mismatches',()=>{const unknown=build({attestations:[{...attestation,queueItemId:'missing'}]});assert.deepEqual(unknown.decisions[0]?.errors,['unknown_queue_item']);const mismatch=build({attestations:[{...attestation,proposalId:'other'}]});assert.deepEqual(mismatch.decisions[0]?.errors,['proposal_id_mismatch']);});
test('requires reviewer and reason',()=>{const result=build({attestations:[{...attestation,reviewerId:'',reason:''}]});assert.deepEqual(result.decisions[0]?.errors,['decision_reason_required','reviewer_id_required']);});
test('prevents approval for blocked or evidence queues',()=>{const blocked=build({queue:{...queue,disposition:'blocked'}});assert.equal(blocked.disposition,'blocked');assert.ok(blocked.decisions[0]?.errors.includes('blocked_queue_cannot_approve'));const evidence=build({queue:{...queue,disposition:'needs_evidence'}});assert.equal(evidence.disposition,'needs_evidence');assert.ok(evidence.decisions[0]?.errors.includes('evidence_required_before_approval'));});
test('detects duplicate reviewer attestations',()=>{const result=build({attestations:[attestation,attestation]});assert.equal(result.decisions[1]?.valid,false);assert.ok(result.decisions[1]?.errors.includes('duplicate_reviewer_attestation'));});
test('bounds decisions',()=>{const result=build({attestations:[attestation,{...attestation,reviewerId:'reviewer-2'}],maxDecisions:1});assert.equal(result.decisions.length,1);assert.equal(result.truncated,true);assert.throws(()=>build({maxDecisions:0}),/unbounded_review_decisions_rejected/);});
test('sorts and deduplicates evidence',()=>{const result=build();assert.deepEqual(result.decisions[0]?.evidenceRefs,['a','c']);assert.deepEqual(result.evidenceRefs,['a','c','root']);});
