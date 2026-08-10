import assert from 'node:assert/strict'
import test from 'node:test'

import { buildEnterpriseAiOsLearningPayload, buildEnterpriseAiOsSnapshot, buildGoalPlanDecision, getEnterpriseRole, getEnterpriseSkill, recommendEnterpriseRoles } from '../lib/enterprise-ai-os/index.ts'
import type { EnterpriseGoal } from '../lib/enterprise-ai-os/types.ts'
import type { RevenueOptimizationSignal } from '../lib/revenue/hub/signals.ts'

const tenant = { tenantId:'tenant-a', environmentId:'prod', region:'us' }
const goal: EnterpriseGoal = {
  schemaVersion:'1.0.0',
  goalId:'goal-grow-revenue',
  tenant,
  title:'Increase sales revenue and win rate',
  status:'active',
  priority:900,
  roleId:'ai_sales_manager',
  metrics:[
    { metric:'win_rate', target:0.5, direction:'increase', weight:0.5 },
    { metric:'open_pipeline_value', target:500000, direction:'increase', weight:0.5, currency:'USD' },
  ],
  constraints:['approval_required_for_external_mutation'],
  requiredSkillIds:['find_decision_makers'],
  createdAt:'2026-08-09T20:00:00.000Z',
}
const signals: RevenueOptimizationSignal[] = [
  { id:'revenue:win-rate', kind:'conversion', metric:'win_rate', value:0.25, unit:'ratio', evidenceRefs:['rev:1'] },
  { id:'revenue:USD:pipeline', kind:'pipeline', metric:'open_pipeline_value', value:250000, unit:'currency', currency:'USD', evidenceRefs:['rev:2'] },
]

test('enterprise AI OS composes goals, roles, skills and governed plans', () => {
  const snapshot = buildEnterpriseAiOsSnapshot({ tenant, goals:[goal], revenueSignals:signals, generatedAt:'2026-08-09T21:00:00.000Z' })
  assert.equal(snapshot.evaluations.length,1)
  assert.equal(snapshot.evaluations[0].score,0.5)
  assert.equal(snapshot.evaluations[0].status,'active')
  assert.equal(snapshot.recommendedRoleIds.includes('ai_sales_manager'),true)
  assert.equal(snapshot.recommendedSkillIds.includes('manage_pipeline'),true)
  assert.equal(snapshot.recommendedSkillIds.includes('find_decision_makers'),true)
  assert.equal(snapshot.plan.executable,false)
  assert.equal(snapshot.plan.steps.length > 3,true)
  assert.deepEqual(snapshot.evidenceRefs,['rev:1','rev:2'])
})

test('external mutation skills preserve approval boundaries', () => {
  assert.equal(getEnterpriseSkill('send_approved_outreach')?.requiredApproval,true)
  assert.equal(getEnterpriseSkill('send_approved_outreach')?.mutating,true)
  assert.equal(getEnterpriseSkill('forecast_revenue')?.mutating,false)
})

test('enterprise roles compose reusable skills rather than duplicate workflows', () => {
  assert.equal(getEnterpriseRole('ai_sdr').skillIds.includes('find_decision_makers'),true)
  assert.equal(getEnterpriseRole('ai_revenue_operations').skillIds.includes('forecast_revenue'),true)
  assert.equal(recommendEnterpriseRoles('Generate 100 SQL meetings').includes('ai_sdr'),true)
})

test('goal plans bridge into the existing EAE decision engine', () => {
  const snapshot = buildEnterpriseAiOsSnapshot({ tenant, goals:[goal], revenueSignals:signals, generatedAt:'2026-08-09T21:00:00.000Z' })
  const decision = buildGoalPlanDecision({ tenant, goals:[goal], plan:snapshot.plan })
  assert.equal(decision.tenant.tenantId,'tenant-a')
  assert.equal(decision.rankedCandidateIds.length > 0,true)
  assert.equal(['proceed','require_review'].includes(decision.disposition),true)
})

test('enterprise AI OS snapshots produce reusable memory payloads', () => {
  const snapshot = buildEnterpriseAiOsSnapshot({ tenant, goals:[goal], revenueSignals:signals, generatedAt:'2026-08-09T21:00:00.000Z' })
  const payload = buildEnterpriseAiOsLearningPayload(snapshot)
  assert.equal(payload.enterpriseAiOs.plan.planId,snapshot.plan.planId)
  assert.deepEqual(payload.enterpriseAiOs.recommendedRoleIds,['ai_sales_manager'])
})

test('tenant boundaries reject cross-tenant goals', () => {
  assert.throws(() => buildEnterpriseAiOsSnapshot({ tenant, goals:[{...goal,tenant:{tenantId:'tenant-b',environmentId:'prod'}}], revenueSignals:signals }),/goal_tenant_boundary_violation/)
})
