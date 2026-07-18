import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deduplicateEnterpriseEvidenceEvents,
  normalizeEnterpriseEvidenceEvent,
} from '../lib/enterprise/memory/evidenceBus.ts'

const NOW = '2026-07-18T19:00:00.000Z'

test('normalizes a versioned cross-agent evidence event', () => {
  const event = normalizeEnterpriseEvidenceEvent({
    eventId: 'deploy-1',
    type: 'deployment.failed',
    organizationId: 'org-1',
    workspace: 'supervisor',
    agent: 'vercel',
    occurredAt: '2026-07-18T18:59:00Z',
    confidence: 1.4,
    correlationId: 'incident-7',
    entities: { deploymentId: 'dep-1', commitSha: 'abc123' },
    payload: { message: 'Build failed' },
  }, { now: NOW })

  assert.equal(event.version, 1)
  assert.equal(event.confidence, 1)
  assert.equal(event.receivedAt, NOW)
  assert.equal(event.entities.commitSha, 'abc123')
  assert.equal(event.deduplicationKey, 'org-1|deployment.failed|deploy-1')
  assert.equal(event.correlationId, 'incident-7')
})

test('creates deterministic fallback identifiers', () => {
  const first = normalizeEnterpriseEvidenceEvent({
    type: 'repository.analysis_completed',
    organizationId: 'org-1',
    agent: 'repository',
    occurredAt: '2026-07-18T18:00:00Z',
    entities: { repository: 'SignalBoost/signalboost-live', commitSha: 'abc123' },
  }, { now: NOW })
  const second = normalizeEnterpriseEvidenceEvent({
    type: 'repository.analysis_completed',
    organizationId: 'org-1',
    agent: 'repository',
    occurredAt: '2026-07-18T18:00:00Z',
    entities: { commitSha: 'abc123', repository: 'SignalBoost/signalboost-live' },
  }, { now: NOW })

  assert.equal(first.eventId, second.eventId)
  assert.equal(first.deduplicationKey, second.deduplicationKey)
})

test('deduplicates events while preserving first-seen order', () => {
  const one = normalizeEnterpriseEvidenceEvent({
    eventId: 'event-1',
    type: 'incident.resolved',
    organizationId: 'org-1',
    agent: 'supervisor',
    occurredAt: '2026-07-18T18:00:00Z',
  }, { now: NOW })
  const duplicate = normalizeEnterpriseEvidenceEvent({
    eventId: 'event-1',
    type: 'incident.resolved',
    organizationId: 'org-1',
    agent: 'supervisor',
    occurredAt: '2026-07-18T18:01:00Z',
  }, { now: NOW })
  const two = normalizeEnterpriseEvidenceEvent({
    eventId: 'event-2',
    type: 'incident.resolved',
    organizationId: 'org-1',
    agent: 'supervisor',
    occurredAt: '2026-07-18T18:02:00Z',
  }, { now: NOW })

  assert.deepEqual(deduplicateEnterpriseEvidenceEvents([one, duplicate, two]).map(event => event.eventId), ['event-1', 'event-2'])
})

test('rejects unsupported agents and event types', () => {
  assert.throws(() => normalizeEnterpriseEvidenceEvent({
    type: 'unknown.event',
    organizationId: 'org-1',
    agent: 'vercel',
    occurredAt: NOW,
  }), /not supported/)

  assert.throws(() => normalizeEnterpriseEvidenceEvent({
    type: 'deployment.failed',
    organizationId: 'org-1',
    agent: 'rogue-agent',
    occurredAt: NOW,
  }), /not supported/)
})

test('rejects missing identity and invalid dates', () => {
  assert.throws(() => normalizeEnterpriseEvidenceEvent({
    type: 'deployment.failed',
    organizationId: '',
    agent: 'vercel',
    occurredAt: NOW,
  }), /organizationId is required/)

  assert.throws(() => normalizeEnterpriseEvidenceEvent({
    type: 'deployment.failed',
    organizationId: 'org-1',
    agent: 'vercel',
    occurredAt: 'not-a-date',
  }), /valid ISO date/)
})

test('sanitizes optional entities and payloads', () => {
  const event = normalizeEnterpriseEvidenceEvent({
    eventId: 'event-3',
    type: 'browser.observation_recorded',
    organizationId: 'org-1',
    agent: 'browser',
    occurredAt: NOW,
    entities: { sessionId: 'session-1', unknown: 'ignored' },
    payload: 'not-an-object',
    confidence: -5,
  }, { now: NOW })

  assert.deepEqual(event.entities, { sessionId: 'session-1' })
  assert.deepEqual(event.payload, {})
  assert.equal(event.confidence, 0)
})
