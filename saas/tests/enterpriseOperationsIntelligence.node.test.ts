import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOperationsIntelligenceSnapshot } from '../lib/enterprise/operations/operationsIntelligence.ts'
import type { ClosedLoopVerificationResult } from '../lib/enterprise/memory/closedLoopVerification.ts'
import type { OrganizationalRepairLearning } from '../lib/enterprise/memory/organizationalLearning.ts'
import type { EnterprisePlaybookRegistry } from '../lib/enterprise/memory/playbookIntelligence.ts'

const verification = (status: ClosedLoopVerificationResult['status'], confidence = 0.9): ClosedLoopVerificationResult => ({
  organizationId: 'org-1', targetEventId: `event-${status}`, status, confidence,
  checks: [], verifiedChecks: [], failedChecks: [], missingChecks: [],
  recommendation: status === 'verified' ? 'request_incident_closure_approval' : status === 'failed' ? 'keep_incident_open' : 'collect_more_evidence',
  unknowns: [],
})

const learning: OrganizationalRepairLearning = {
  organizationId: 'org-1', acceptedSamples: [{
    sampleId: 'sample-1', organizationId: 'org-1', targetEventId: 'event-1', strategyKey: 'vercel:medium:check', systems: ['vercel'], outcome: 'success', confidence: 0.9, recordedAt: '2026-07-18T12:00:00.000Z',
  }], ignoredOutcomeCount: 1, strategies: [{
    strategyKey: 'vercel:medium:check', systems: ['vercel'], verifiedAttempts: 3, successes: 2, failures: 1, successRate: 0.667, averageVerificationConfidence: 0.8, recommendationConfidence: 0.48, sampleIds: ['sample-1'],
  }],
}

const playbooks: EnterprisePlaybookRegistry = {
  organizationId: 'org-1', incidentClass: 'deployment', versions: [], current: [
    { playbookId: 'pb-1', organizationId: 'org-1', incidentClass: 'deployment', strategyFingerprint: 'fp-1', strategyKey: 'a', systems: ['vercel'], version: 1, status: 'trusted', verifiedAttempts: 20, successes: 20, failures: 0, successRate: 1, confidence: 0.9, sampleIds: [], createdAt: '2026-07-18T12:00:00.000Z' },
    { playbookId: 'pb-2', organizationId: 'org-1', incidentClass: 'deployment', strategyFingerprint: 'fp-2', strategyKey: 'b', systems: ['security'], version: 1, status: 'candidate', verifiedAttempts: 1, successes: 1, failures: 0, successRate: 1, confidence: 0.3, sampleIds: [], createdAt: '2026-07-18T12:00:00.000Z' },
  ],
}

test('operations intelligence aggregates incidents, verification, learning, and playbooks', () => {
  const snapshot = buildOperationsIntelligenceSnapshot({
    organizationId: 'org-1', generatedAt: '2026-07-18T13:00:00.000Z', learning, playbooks,
    incidents: [
      { incidentId: 'critical-1', organizationId: 'org-1', severity: 'critical', status: 'verification_pending', openedAt: '2026-07-18T10:00:00Z', updatedAt: '2026-07-18T12:30:00Z' },
      { incidentId: 'resolved-1', organizationId: 'org-1', severity: 'high', status: 'resolved', openedAt: '2026-07-17T10:00:00Z', updatedAt: '2026-07-18T11:00:00Z' },
    ],
    verifications: [verification('verified', 0.9), verification('failed', 0.7), verification('inconclusive', 0.2)],
  })
  assert.equal(snapshot.incidents.open, 1)
  assert.equal(snapshot.incidents.critical, 1)
  assert.equal(snapshot.incidents.awaitingVerification, 1)
  assert.equal(snapshot.verification.completed, 2)
  assert.equal(snapshot.verification.successRate, 0.5)
  assert.equal(snapshot.learning.acceptedSamples, 1)
  assert.equal(snapshot.playbooks.trusted, 1)
  assert.deepEqual(snapshot.recentIncidentIds, ['critical-1', 'resolved-1'])
  assert.equal(snapshot.health.state, 'red')
})

test('operations intelligence isolates organizations and remains healthy with no scoped failures', () => {
  const snapshot = buildOperationsIntelligenceSnapshot({
    organizationId: 'org-1', generatedAt: '2026-07-18T13:00:00Z', learning, playbooks,
    incidents: [{ incidentId: 'other', organizationId: 'org-2', severity: 'critical', status: 'open', openedAt: '2026-07-18T10:00:00Z', updatedAt: '2026-07-18T12:00:00Z' }],
    verifications: [{ ...verification('failed'), organizationId: 'org-2' }],
  })
  assert.equal(snapshot.incidents.total, 0)
  assert.equal(snapshot.verification.completed, 0)
  assert.equal(snapshot.health.state, 'green')
})

test('operations intelligence reports red health for severe unresolved conditions', () => {
  const snapshot = buildOperationsIntelligenceSnapshot({
    organizationId: 'org-1', generatedAt: '2026-07-18T13:00:00Z', learning, playbooks,
    incidents: [
      { incidentId: 'c1', organizationId: 'org-1', severity: 'critical', status: 'open', openedAt: '2026-07-18T10:00:00Z', updatedAt: '2026-07-18T12:00:00Z' },
      { incidentId: 'c2', organizationId: 'org-1', severity: 'critical', status: 'open', openedAt: '2026-07-18T10:00:00Z', updatedAt: '2026-07-18T12:01:00Z' },
    ],
    verifications: [verification('failed'), verification('failed')],
  })
  assert.equal(snapshot.health.state, 'red')
  assert.ok(snapshot.health.score < 70)
})

test('operations intelligence rejects mismatched organizations and invalid timestamps', () => {
  assert.throws(() => buildOperationsIntelligenceSnapshot({ organizationId: 'org-2', incidents: [], verifications: [], learning, playbooks }), /learning organization mismatch/)
  assert.throws(() => buildOperationsIntelligenceSnapshot({ organizationId: 'org-1', incidents: [{ incidentId: 'bad', organizationId: 'org-1', severity: 'low', status: 'open', openedAt: 'bad', updatedAt: '2026-07-18T12:00:00Z' }], verifications: [], learning, playbooks }), /openedAt/)
})
