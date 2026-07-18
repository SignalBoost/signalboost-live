import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeEnterpriseEvidenceEvent } from '../lib/enterprise/memory/evidenceBus.ts'
import { correlateEnterpriseEvidenceEvents } from '../lib/enterprise/memory/evidenceCorrelation.ts'

function event(overrides: Record<string, unknown>) {
  return normalizeEnterpriseEvidenceEvent({
    type: 'deployment.failed',
    organizationId: 'org-1',
    workspace: 'operations',
    agent: 'vercel',
    occurredAt: '2026-07-18T12:00:00.000Z',
    receivedAt: '2026-07-18T12:00:01.000Z',
    confidence: 0.8,
    entities: { deploymentId: 'dep-1', commitSha: 'abc123' },
    payload: {},
    ...overrides,
  })
}

test('correlates cross-agent events with shared deployment and commit evidence', () => {
  const result = correlateEnterpriseEvidenceEvents([
    event({ eventId: 'deploy', correlationId: 'incident-1' }),
    event({
      eventId: 'browser',
      type: 'browser.observation_recorded',
      agent: 'browser',
      occurredAt: '2026-07-18T12:02:00.000Z',
      correlationId: 'incident-1',
      confidence: 0.9,
    }),
  ])

  assert.equal(result.links.length, 1)
  assert.deepEqual(result.links[0].reasons, [
    'correlation_id',
    'commit_sha',
    'deployment_id',
    'time_proximity',
  ])
  assert.ok(result.links[0].confidence > 0.9)
})

test('does not correlate time proximity without a shared identifier', () => {
  const result = correlateEnterpriseEvidenceEvents([
    event({ eventId: 'a', entities: { deploymentId: 'dep-a' }, correlationId: 'a' }),
    event({
      eventId: 'b',
      occurredAt: '2026-07-18T12:00:05.000Z',
      entities: { deploymentId: 'dep-b' },
      correlationId: 'b',
    }),
  ])
  assert.equal(result.links.length, 0)
})

test('never correlates events across organizations', () => {
  const result = correlateEnterpriseEvidenceEvents([
    event({ eventId: 'a' }),
    event({ eventId: 'b', organizationId: 'org-2' }),
  ])
  assert.equal(result.links.length, 0)
})

test('handles out-of-order arrival deterministically', () => {
  const later = event({ eventId: 'later', occurredAt: '2026-07-18T12:05:00.000Z' })
  const earlier = event({ eventId: 'earlier', occurredAt: '2026-07-18T12:00:00.000Z' })
  const result = correlateEnterpriseEvidenceEvents([later, earlier])

  assert.deepEqual(result.events.map(item => item.eventId), ['earlier', 'later'])
  assert.equal(result.links[0].id, 'earlier|later')
})

test('shared repository evidence has lower confidence than exact deployment evidence', () => {
  const repository = correlateEnterpriseEvidenceEvents([
    event({ eventId: 'repo-a', entities: { repository: 'SignalBoost/signalboost-live' } }),
    event({ eventId: 'repo-b', entities: { repository: 'signalboost/signalboost-live' } }),
  ])
  const deployment = correlateEnterpriseEvidenceEvents([
    event({ eventId: 'dep-a', entities: { deploymentId: 'dep-1' } }),
    event({ eventId: 'dep-b', entities: { deploymentId: 'dep-1' } }),
  ])

  assert.ok(deployment.links[0].confidence > repository.links[0].confidence)
})

test('respects time windows, confidence thresholds, and link bounds', () => {
  const events = [
    event({ eventId: 'a', occurredAt: '2026-07-18T12:00:00.000Z' }),
    event({ eventId: 'b', occurredAt: '2026-07-18T13:00:00.000Z' }),
    event({ eventId: 'c', occurredAt: '2026-07-18T14:00:00.000Z' }),
  ]
  const result = correlateEnterpriseEvidenceEvents(events, {
    maxTimeDistanceMs: 1_000,
    minimumConfidence: 0.5,
    maxLinks: 1,
  })

  assert.equal(result.links.length, 1)
  assert.ok(!result.links[0].reasons.includes('time_proximity'))
})

test('rejects unsafe correlation options', () => {
  const events = [event({ eventId: 'a' })]
  assert.throws(() => correlateEnterpriseEvidenceEvents(events, { maxTimeDistanceMs: -1 }))
  assert.throws(() => correlateEnterpriseEvidenceEvents(events, { minimumConfidence: 2 }))
  assert.throws(() => correlateEnterpriseEvidenceEvents(events, { maxLinks: 0 }))
})
