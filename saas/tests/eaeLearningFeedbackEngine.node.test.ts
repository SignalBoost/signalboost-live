import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveEnterpriseLearningFeedback } from '../lib/autonomous-systems/learning-feedback-engine.ts';
import type { EnterpriseOutcomeEvaluationSnapshot } from '../lib/autonomous-systems/outcome-evaluator.ts';

const tenant={tenantId:'tenant-a',environmentId:'prod',region:'us'};
const evaluation:EnterpriseOutcomeEvaluationSnapshot={schemaVersion:'1.0.0',evaluationId:'eval-1',tenant,simulationId:'sim-1',planId:'plan-1',disposition:'validated',readOnly:true,executable:false,policyCompliant:true,weightedScore:1,metrics:[{metricId:'quality',target:100,actual:100,weight:1,status:'met',score:1,evidenceRefs:['quality-evidence']}],recommendations:['retain_current_plan_for_human_review'],evidenceRefs:['evaluation-evidence'],truncated:false};
function derive(overrides:Partial<Parameters<typeof deriveEnterpriseLearningFeedback>[0]>={}){return deriveEnterpriseLearningFeedback({tenant,evaluation,priorSignalIds:[],maxSignals:16,...overrides});}

test('builds deterministic immutable learning feedback',()=>{const a=derive();const b=derive();assert.equal(a.feedbackId,b.feedbackId);assert.equal(a.disposition,'eligible_for_review');assert.equal(a.readOnly,true);assert.equal(a.executable,false);assert.ok(Object.isFrozen(a));assert.ok(Object.isFrozen(a.signals[0]));});
test('reinforces met metrics and adjusts missed metrics',()=>{const missed={...evaluation,disposition:'needs_review' as const,metrics:[{...evaluation.metrics[0]!,status:'missed' as const,score:.5}]};const result=derive({evaluation:missed});assert.ok(result.signals.some(s=>s.kind==='adjust'));assert.equal(result.disposition,'needs_evidence');});
test('investigates unavailable evidence',()=>{const unavailable={...evaluation,disposition:'needs_review' as const,metrics:[{...evaluation.metrics[0]!,status:'unavailable' as const,actual:undefined,score:0}]};const result=derive({evaluation:unavailable});assert.ok(result.signals.some(s=>s.kind==='investigate'&&s.confidence===0));});
test('blocks feedback from blocked evaluations',()=>{const result=derive({evaluation:{...evaluation,disposition:'blocked'}});assert.equal(result.disposition,'blocked');});
test('enforces tenant and safety boundaries',()=>{assert.throws(()=>derive({tenant:{tenantId:'other',environmentId:'prod'}}),/evaluation_tenant_boundary_violation/);assert.throws(()=>derive({evaluation:{...evaluation,executable:true as never}}),/unsafe_evaluation_rejected/);});
test('suppresses prior signal ids deterministically',()=>{const first=derive();const id=first.signals[0]!.signalId;const second=derive({priorSignalIds:[id]});assert.ok(second.suppressedSignalIds.includes(id));assert.ok(!second.signals.some(s=>s.signalId===id));});
test('rejects duplicate prior ids',()=>{assert.throws(()=>derive({priorSignalIds:['x','x']}),/duplicate_prior_signal_id/);});
test('bounds signals and reports truncation',()=>{const result=derive({maxSignals:1});assert.equal(result.signals.length,1);assert.equal(result.truncated,true);assert.throws(()=>derive({maxSignals:0}),/unbounded_learning_feedback_rejected/);});
