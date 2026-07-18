import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyEnterpriseRepairOutcome } from '../lib/enterprise/memory/closedLoopVerification.ts'
import type { EnterpriseRepairPlan } from '../lib/enterprise/memory/repairPlanning.ts'

function plan(overrides: Partial<EnterpriseRepairPlan> = {}): EnterpriseRepairPlan {
  return {
    organizationId: 'org-1',
    targetEventId: 'incident-1',
    status: 'proposed',
    objective: 'Repair incident-1.',
    confidence: 0.86,
    assumptions: [],
    steps: [{
      sequence: 1,
      action: 'Redeploy approved revision.',
      system: 'vercel',
      risk: 'medium',
      requiresApproval: true,
      verification: [
        'Vercel reports a successful deployment.',
        'Browser Agent repeats the affected user-flow check.',
      ],
      evidenceEventIds: ['deploy-1'],
    }],
    rollbackStrategy: ['Restore the last known-good deployment.'],
    ...overrides,
  }
}

const observations = [
  {
    observationId: 'obs-vercel',
    check: 'Vercel reports a successful deployment.',
    status: 'passed' as const,
    observedAt: '2026-07-18T16:00:00.000Z',
    confidence: 0.95,
    evidenceEventIds: ['deploy-2'],
  },
  {
    observationId: 'obs-browser',
    check: 'Browser Agent repeats the affected user-flow check.',
    status: 'passed' as const,
    observedAt: '2026-07-18T16:01:00.000Z',
    confidence: 0.9,
    evidenceEventIds: ['browser-2'],
  },
]

test('verification requires complete fresh passing evidence before recommending closure approval', () => {
  const result = verifyEnterpriseRepairOutcome(plan(), observations)
  assert.equal(result.status, 'verified')
  assert.equal(result.recommendation, 'request_incident_closure_approval')
  assert.equal(result.verifiedChecks.length, 2)
  assert.equal(result.confidence, 0.925)
  assert.ok(result.unknowns.some(item => item.includes('approval')))
})

test('verification fails when any required check contradicts the repair outcome', () => {
  const result = verifyEnterpriseRepairOutcome(plan(), [
    observations[0],
    { ...observations[1], observationId: 'obs-browser-failed', status: 'failed' },
  ])
  assert.equal(result.status, 'failed')
  assert.equal(result.recommendation, 'keep_incident_open')
  assert.deepEqual(result.failedChecks, ['Browser Agent repeats the affected user-flow check.'])
})

test('verification remains inconclusive when required evidence is missing', () => {
  const result = verifyEnterpriseRepairOutcome(plan(), [observations[0]])
  assert.equal(result.status, 'inconclusive')
  assert.equal(result.recommendation, 'collect_more_evidence')
  assert.deepEqual(result.missingChecks, ['Browser Agent repeats the affected user-flow check.'])
})

test('verification deterministically uses the newest observation for each check', () => {
  const result = verifyEnterpriseRepairOutcome(plan(), [
    ...observations,
    {
      ...observations[1],
      observationId: 'obs-browser-newer-failure',
      status: 'failed',
      observedAt: '2026-07-18T16:02:00.000Z',
    },
  ])
  assert.equal(result.status, 'failed')
  assert.equal(result.checks.find(item => item.check.startsWith('Browser'))?.observationId, 'obs-browser-newer-failure')
})

test('verification treats low-confidence passing observations as failed', () => {
  const result = verifyEnterpriseRepairOutcome(plan(), [
    observations[0],
    { ...observations[1], confidence: 0.4 },
  ], { minimumConfidence: 0.6 })
  assert.equal(result.status, 'failed')
})

test('verification refuses to infer outcomes from an unsupported repair plan', () => {
  const result = verifyEnterpriseRepairOutcome(plan({ status: 'insufficient_evidence', steps: [] }), observations)
  assert.equal(result.status, 'inconclusive')
  assert.equal(result.confidence, 0)
  assert.equal(result.recommendation, 'collect_more_evidence')
})

test('verification validates options and observation identity', () => {
  assert.throws(() => verifyEnterpriseRepairOutcome(plan(), observations, { minimumConfidence: 2 }), /minimumConfidence/)
  assert.throws(() => verifyEnterpriseRepairOutcome(plan(), [{ ...observations[0], observationId: '' }]), /observationId/)
  assert.throws(() => verifyEnterpriseRepairOutcome(plan(), [{ ...observations[0], observedAt: 'invalid' }]), /timestamp/)
})
