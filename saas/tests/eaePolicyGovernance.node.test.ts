import assert from 'node:assert/strict';
import test from 'node:test';
import { EAE_POLICY_SCHEMA_VERSION, evaluateGovernancePolicies, type GovernancePolicy } from '../lib/autonomous-systems/policy-governance.ts';

const tenant={tenantId:'tenant-a',environmentId:'prod',region:'us'};
const request={tenant,actionCategory:'publish',riskLevel:'high' as const,region:'us',businessUnitId:'bu',teamId:'team',workflowId:'wf',evaluatedAt:'2026-07-24T12:00:00.000Z',maxPolicies:16};
function policy(overrides:Partial<GovernancePolicy>={}):GovernancePolicy{return {schemaVersion:EAE_POLICY_SCHEMA_VERSION,policyId:'p1',tenant,name:'Policy',scope:'global',actionCategory:'publish',riskLevel:'high',effect:'require_review',precedence:10,enabled:true,evidenceRefs:['ev1'],metadata:{classification:'internal'},...overrides};}

test('highest precedence policy decides deterministically',()=>{const result=evaluateGovernancePolicies([policy(),policy({policyId:'p2',effect:'deny',precedence:20})],request);assert.equal(result.effect,'deny');assert.equal(result.blocked,true);assert.deepEqual(result.decisivePolicyIds,['p2']);assert.equal(result.decisionId,evaluateGovernancePolicies([policy(),policy({policyId:'p2',effect:'deny',precedence:20})],request).decisionId);});
test('equal precedence contradiction escalates',()=>{const result=evaluateGovernancePolicies([policy({effect:'allow'}),policy({policyId:'p2',effect:'deny'})],request);assert.equal(result.effect,'escalate');assert.equal(result.conflicts[0]?.reason,'equal_precedence_contradiction');});
test('scope, time, action, and risk filters apply',()=>{const result=evaluateGovernancePolicies([policy({scope:'region',scopeId:'eu',effect:'deny'}),policy({policyId:'p2',scope:'workflow',scopeId:'wf',effect:'allow'}),policy({policyId:'p3',validUntil:'2020-01-01T00:00:00.000Z',effect:'deny'})],request);assert.equal(result.effect,'allow');assert.deepEqual(result.matchedPolicyIds,['p2']);});
test('no match defaults to review',()=>{const result=evaluateGovernancePolicies([],request);assert.equal(result.effect,'require_review');assert.equal(result.blocked,false);});
test('tenant boundary is enforced',()=>{assert.throws(()=>evaluateGovernancePolicies([policy({tenant:{tenantId:'other',environmentId:'prod'}})],request),/tenant_environment_boundary_violation/);});
test('circular overrides escalate',()=>{const result=evaluateGovernancePolicies([policy({overrides:['p2']}),policy({policyId:'p2',overrides:['p1']})],request);assert.equal(result.effect,'escalate');assert.ok(result.conflicts.some(x=>x.reason==='circular_override'));});
test('secret-shaped metadata is rejected',()=>{assert.throws(()=>evaluateGovernancePolicies([policy({metadata:{apiKey:'x'}})],request),/metadata_secret_rejected/);});
test('bounds and truncation are enforced',()=>{assert.throws(()=>evaluateGovernancePolicies([], {...request,maxPolicies:0}),/unbounded_policy_request_rejected/);const result=evaluateGovernancePolicies([policy(),policy({policyId:'p2',precedence:9})],{...request,maxPolicies:1});assert.equal(result.truncated,true);});
