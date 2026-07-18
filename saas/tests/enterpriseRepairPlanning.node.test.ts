import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEnterpriseRepairPlan } from '../lib/enterprise/memory/repairPlanning.ts'
import type { RootCauseAnalysis } from '../lib/enterprise/memory/rootCauseAnalysis.ts'

function analysis(overrides: Partial<RootCauseAnalysis> = {}): RootCauseAnalysis {
  return {
    organizationId: 'org-1',
    targetEventId: 'browser-1',
    status: 'supported',
    primaryHypothesis: {
      eventId: 'deploy-1',
      summary: 'deployment.failed (dep-1) is a possible contributor to browser.observation_recorded (browser-1).',
      confidence: 0.86,
      supportingEvidence: ['Shared deployment id.'],
      contradictingEvidence: [],
      relatedEventIds: ['browser-1'],
    },
    alternateHypotheses: [],
    unknowns: ['Correlation does not establish causation.'],
    ...overrides,
  }
}

test('repair planner proposes approval-bound reversible steps from supported RCA', () => {
  const plan = buildEnterpriseRepairPlan(analysis())
  assert.equal(plan.status, 'proposed')
  assert.equal(plan.steps.length, 1)
  assert.equal(plan.steps[0].system, 'vercel')
  assert.equal(plan.steps[0].requiresApproval, true)
  assert.ok(plan.steps[0].verification.some(item => item.includes('Browser Agent')))
  assert.ok(plan.rollbackStrategy.length >= 2)
  assert.equal(plan.confidence, 0.86)
})

test('repair planner returns insufficient evidence without supported hypotheses', () => {
  const plan = buildEnterpriseRepairPlan(analysis({
    status: 'insufficient_evidence',
    primaryHypothesis: null,
    alternateHypotheses: [],
  }))
  assert.equal(plan.status, 'insufficient_evidence')
  assert.deepEqual(plan.steps, [])
  assert.equal(plan.confidence, 0)
})

test('repair planner applies system-specific risk and verification', () => {
  const plan = buildEnterpriseRepairPlan(analysis({
    primaryHypothesis: {
      eventId: 'security-1',
      summary: 'security.finding_recorded (finding-1) is a possible contributor to browser.observation_recorded (browser-1).',
      confidence: 0.92,
      supportingEvidence: ['Shared incident id.'],
      contradictingEvidence: [],
      relatedEventIds: ['browser-1'],
    },
  }))
  assert.equal(plan.steps[0].system, 'security')
  assert.equal(plan.steps[0].risk, 'high')
  assert.ok(plan.steps[0].verification.some(item => item.includes('Security scanner')))
})

test('repair planner filters weak alternate hypotheses and respects maxSteps', () => {
  const plan = buildEnterpriseRepairPlan(analysis({
    alternateHypotheses: [
      {
        eventId: 'repo-1',
        summary: 'repository.analysis_completed (repo-1) is a possible contributor.',
        confidence: 0.7,
        supportingEvidence: ['Shared repository.'],
        contradictingEvidence: [],
        relatedEventIds: ['browser-1'],
      },
      {
        eventId: 'repo-weak',
        summary: 'repository.analysis_completed (repo-weak) is a possible contributor.',
        confidence: 0.2,
        supportingEvidence: [],
        contradictingEvidence: ['Weak evidence.'],
        relatedEventIds: [],
      },
    ],
  }), { maxSteps: 1, minimumConfidence: 0.5 })
  assert.equal(plan.steps.length, 1)
  assert.equal(plan.steps[0].eventId, undefined)
})

test('repair planner rejects unsafe limits', () => {
  assert.throws(() => buildEnterpriseRepairPlan(analysis(), { maxSteps: 0 }), /maxSteps/)
  assert.throws(() => buildEnterpriseRepairPlan(analysis(), { minimumConfidence: 2 }), /minimumConfidence/)
})
