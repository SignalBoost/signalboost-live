import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnterpriseHumanReviewDecisionLedger } from '../lib/autonomous-systems/human-review-decision-ledger.ts';
import type { EnterpriseHumanReviewDecisionSnapshot } from '../lib/autonomous-systems/human-review-decision-validator.ts';

const tenant={tenantId:'tenant-a',environmentId:'prod',region:'us'};
const decisionSet:EnterpriseHumanReviewDecisionSnapshot={schemaVersion:'1.0.0',decisionSetId:'set-1',tenant,queueId:'queue-1',disposition:'valid',readOnly:true,executable:false,decisions:[{decisionId:'d-1',queueItemId:'q-1',proposalId:'p-1',reviewerId:'r-1',decision:'approve',reason:'reviewed',valid:true,errors:[],evidenceRefs:['b','a'],executable:false}],evidenceRefs:['root'],truncated:false};
function build(overrides:Partial<Parameters<typeof buildEnterpriseHumanReviewDecisionLedger>[0]>={}){return buildEnterpriseHumanReviewDecisionLedger({tenant,decisionSets:[decisionSet],priorEntryIds:[],maxEntries:32,...overrides});}

test('builds deterministic immutable ledger snapshots',()=>{const a=build();const b=build();assert.equal(a.ledgerId,b.ledgerId);assert.equal(a.disposition,'complete');assert.equal(a.executable,false);assert.ok(Object.isFrozen(a));assert.ok(Object.isFrozen(a.entries[0]));});
test('preserves decision identity and sorted evidence',()=>{const result=build();assert.equal(result.entries[0]?.decisionId,'d-1');assert.equal(result.entries[0]?.proposalId,'p-1');assert.deepEqual(result.entries[0]?.evidenceRefs,['a','b']);assert.deepEqual(result.evidenceRefs,['a','b','root']);});
test('preserves blocked and evidence dispositions',()=>{assert.equal(build({decisionSets:[{...decisionSet,disposition:'blocked'}]}).disposition,'blocked');assert.equal(build({decisionSets:[{...decisionSet,disposition:'needs_evidence'}]}).disposition,'needs_evidence');});
test('marks invalid decisions',()=>{const invalid={...decisionSet,decisions:[{...decisionSet.decisions[0]!,valid:false,errors:['bad']}]} as EnterpriseHumanReviewDecisionSnapshot;assert.equal(build({decisionSets:[invalid]}).disposition,'invalid');});
test('enforces tenant and safety boundaries',()=>{assert.throws(()=>build({tenant:{tenantId:'other',environmentId:'prod'}}),/decision_set_tenant_boundary_violation/);assert.throws(()=>build({decisionSets:[{...decisionSet,executable:true as never}]}),/unsafe_decision_set_rejected/);});
test('suppresses prior ledger entries',()=>{const first=build();const id=first.entries[0]!.entryId;const second=build({priorEntryIds:[id]});assert.equal(second.entries.length,0);assert.deepEqual(second.priorEntryIds,[id]);});
test('rejects duplicate prior ids',()=>{assert.throws(()=>build({priorEntryIds:['x','x']}),/duplicate_prior_entry_id/);});
test('bounds entries and reports truncation',()=>{const second={...decisionSet,decisionSetId:'set-2',decisions:[{...decisionSet.decisions[0]!,decisionId:'d-2',proposalId:'p-2'}]} as EnterpriseHumanReviewDecisionSnapshot;const result=build({decisionSets:[decisionSet,second],maxEntries:1});assert.equal(result.entries.length,1);assert.equal(result.truncated,true);assert.throws(()=>build({maxEntries:0}),/unbounded_decision_ledger_rejected/);});
