import assert from 'node:assert/strict'
import test from 'node:test'
import { learnFromVerifiedRepairOutcomes } from '../lib/enterprise/memory/organizationalLearning.ts'
import type { ClosedLoopVerificationResult } from '../lib/enterprise/memory/closedLoopVerification.ts'
import type { EnterpriseRepairPlan } from '../lib/enterprise/memory/repairPlanning.ts'

function plan(overrides: Partial<EnterpriseRepairPlan> = {}): EnterpriseRepairPlan {
  return {
    organizationId: 'org-1',
    targetEventId: 'incident-1',
    status: 'proposed',
    objective: 'Repair deployment.',
    confidence: 0.8,
    assumptions: [],
    steps: [{
      sequence: 1,
      action: 'Redeploy.',
      system: 'vercel',
      risk: 'medium',
      requiresApproval: true,
      verification: ['Vercel reports a successful deployment.'],
      evidenceEventIds: ['deploy-1'],
    }],
    rollbackStrategy: ['Rollback.'],
    ...overrides,
  }
}

function verification(status: ClosedLoopVerificationResult['status'], confidence = 0.9): ClosedLoopVerificationResult {
  return {
    organizationId: 'org-1',
    targetEventId: 'incident-1',
    status,
    confidence,
    checks: [],
    verifiedChecks: status === 'verified' ? ['Vercel reports a successful deployment.'] : [],
    failedChecks: status === 'failed' ? ['Vercel reports a successful deployment.'] : [],
    missingChecks: status === 'inconclusive' ? ['Vercel reports a successful deployment.'] : [],
    recommendation: status === 'verified'
      ? 'request_incident_closure_approval'
      : status === 'failed' ? 'keep_incident_open' : 'collect_more_evidence',
    unknowns: [],
  }
}

test('organizational learning accepts verified successes and failures', () => {
  const result = learnFromVerifiedRepairOutcomes('org-1', [
    { sampleId: 'success-1', plan: plan(), verification: verification('verified', 0.9), recordedAt: '2026-07-18T12:00:00Z' },
    { sampleId: 'failure-1', plan: plan(), verification: verification('failed', 0.8), recordedAt: '2026-07-18T13:00:00Z' },
  ])

  assert.equal(result.acceptedSamples.length, 2)
  assert.equal(result.strategies.length, 1)
  assert.equal(result.strategies[0].verifiedAttempts, 2)
  assert.equal(result.strategies[0].successes, 1)
  assert.equal(result.strategies[0].failures, 1)
  assert.equal(result.strategies[0].successRate, 0.5)
  assert.equal(result.strategies[0].averageVerificationConfidence, 0.85)
  assert.equal(result.strategies[0].recommendationConfidence, 0.425)
})

test('organizational learning ignores inconclusive and unrelated outcomes', () => {
  const result = learnFromVerifiedRepairOutcomes('org-1', [
    { sampleId: 'pending-1', plan: plan(), verification: verification('inconclusive'), recordedAt: '2026-07-18T12:00:00Z' },
    {
      sampleId: 'wrong-org',
      plan: plan({ organizationId: 'org-2' }),
      verification: verification('verified'),
      recordedAt: '2026-07-18T13:00:00Z',
    },
  ])

  assert.equal(result.acceptedSamples.length, 0)
  assert.equal(result.ignoredOutcomeCount, 2)
  assert.deepEqual(result.strategies, [])
})

test('organizational learning deduplicates samples using the newest record', () => {
  const result = learnFromVerifiedRepairOutcomes('org-1', [
    { sampleId: 'sample-1', plan: plan(), verification: verification('failed', 0.7), recordedAt: '2026-07-18T12:00:00Z' },
    { sampleId: 'sample-1', plan: plan(), verification: verification('verified', 0.95), recordedAt: '2026-07-18T13:00:00Z' },
  ])

  assert.equal(result.acceptedSamples.length, 1)
  assert.equal(result.acceptedSamples[0].outcome, 'success')
  assert.equal(result.strategies[0].successes, 1)
  assert.equal(result.strategies[0].recommendationConfidence, 0.633)
})

test('organizational learning keeps distinct repair strategies separate', () => {
  const securityPlan = plan({
    steps: [{
      sequence: 1,
      action: 'Remediate finding.',
      system: 'security',
      risk: 'high',
      requiresApproval: true,
      verification: ['Security scanner confirms the finding is no longer present.'],
      evidenceEventIds: ['security-1'],
    }],
  })
  const result = learnFromVerifiedRepairOutcomes('org-1', [
    { sampleId: 'vercel-1', plan: plan(), verification: verification('verified'), recordedAt: '2026-07-18T12:00:00Z' },
    { sampleId: 'security-1', plan: securityPlan, verification: verification('failed'), recordedAt: '2026-07-18T13:00:00Z' },
  ])

  assert.equal(result.strategies.length, 2)
  assert.deepEqual(result.strategies.map(item => item.systems), [['vercel'], ['security']])
})

test('organizational learning rejects malformed identifiers and timestamps', () => {
  assert.throws(() => learnFromVerifiedRepairOutcomes('', []), /organizationId/)
  assert.throws(() => learnFromVerifiedRepairOutcomes('org-1', [
    { sampleId: '', plan: plan(), verification: verification('verified'), recordedAt: '2026-07-18T12:00:00Z' },
  ]), /sampleId/)
  assert.throws(() => learnFromVerifiedRepairOutcomes('org-1', [
    { sampleId: 'sample-1', plan: plan(), verification: verification('verified'), recordedAt: 'not-a-date' },
  ]), /timestamp/)
})
