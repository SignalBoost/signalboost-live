import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeEnterpriseEvidenceEvent } from '../lib/enterprise/memory/evidenceBus.ts'
import { correlateEnterpriseEvidenceEvents } from '../lib/enterprise/memory/evidenceCorrelation.ts'
import { reconstructEnterpriseEvidenceTimeline } from '../lib/enterprise/memory/evidenceTimeline.ts'

function event(overrides: Record<string, unknown>) {
  return normalizeEnterpriseEvidenceEvent({
    type: 'repository.analysis_completed',
    organizationId: 'org-1',
    workspace: 'enterprise',
    agent: 'repository',
    occurredAt: '2026-07-18T12:00:00.000Z',
    confidence: 0.8,
    entities: { repository: 'SignalBoost/signalboost-live', commitSha: 'abc123' },
    payload: {},
    ...overrides,
  }, { now: '2026-07-18T12:10:00.000Z' })
}

test('timeline orders out-of-order evidence and calculates elapsed durations', () => {
  const events = [
    event({ eventId: 'browser-1', type: 'browser.observation_recorded', agent: 'browser', occurredAt: '2026-07-18T12:04:00.000Z', entities: { deploymentId: 'dep-1' } }),
    event({ eventId: 'repo-1', occurredAt: '2026-07-18T12:00:00.000Z', entities: { commitSha: 'abc123' } }),
    event({ eventId: 'deploy-1', type: 'deployment.succeeded', agent: 'vercel', occurredAt: '2026-07-18T12:02:00.000Z', entities: { deploymentId: 'dep-1', commitSha: 'abc123' } }),
  ]
  const correlation = correlateEnterpriseEvidenceEvents(events)
  const timeline = reconstructEnterpriseEvidenceTimeline(correlation)

  assert.ok(timeline)
  assert.deepEqual(timeline.entries.map(entry => entry.eventId), ['repo-1', 'deploy-1', 'browser-1'])
  assert.equal(timeline.entries[0].elapsedFromPreviousMs, null)
  assert.equal(timeline.entries[1].elapsedFromPreviousMs, 120000)
  assert.equal(timeline.entries[2].elapsedFromPreviousMs, 120000)
  assert.equal(timeline.durationMs, 240000)
})

test('timeline exposes only observed correlation links and reasons', () => {
  const events = [
    event({ eventId: 'deploy-1', type: 'deployment.failed', agent: 'vercel', entities: { deploymentId: 'dep-1' } }),
    event({ eventId: 'incident-1', type: 'supervisor.diagnosis_generated', agent: 'supervisor', occurredAt: '2026-07-18T12:01:00.000Z', entities: { deploymentId: 'dep-1', incidentId: 'inc-1' } }),
  ]
  const timeline = reconstructEnterpriseEvidenceTimeline(correlateEnterpriseEvidenceEvents(events))

  assert.ok(timeline)
  assert.deepEqual(timeline.entries[0].relatedEventIds, ['incident-1'])
  assert.ok(timeline.entries[0].correlationReasons.includes('deployment_id'))
})

test('correlatedOnly removes isolated events without inventing connections', () => {
  const events = [
    event({ eventId: 'linked-1', entities: { deploymentId: 'dep-1' } }),
    event({ eventId: 'linked-2', agent: 'vercel', type: 'deployment.succeeded', occurredAt: '2026-07-18T12:01:00.000Z', entities: { deploymentId: 'dep-1' } }),
    event({ eventId: 'isolated', agent: 'security', type: 'security.finding_recorded', occurredAt: '2026-07-18T12:02:00.000Z', entities: { incidentId: 'other' } }),
  ]
  const timeline = reconstructEnterpriseEvidenceTimeline(correlateEnterpriseEvidenceEvents(events), { correlatedOnly: true })

  assert.ok(timeline)
  assert.deepEqual(timeline.entries.map(entry => entry.eventId), ['linked-1', 'linked-2'])
})

test('timeline supports organization, event, and time-window filters', () => {
  const events = [
    event({ eventId: 'a', occurredAt: '2026-07-18T12:00:00.000Z' }),
    event({ eventId: 'b', occurredAt: '2026-07-18T12:05:00.000Z' }),
    event({ eventId: 'other-org', organizationId: 'org-2', occurredAt: '2026-07-18T12:06:00.000Z' }),
  ]
  const timeline = reconstructEnterpriseEvidenceTimeline(correlateEnterpriseEvidenceEvents(events), {
    organizationId: 'org-1',
    startAt: '2026-07-18T12:01:00.000Z',
    eventIds: ['b'],
  })

  assert.ok(timeline)
  assert.deepEqual(timeline.entries.map(entry => entry.eventId), ['b'])
})

test('empty selections return null and unsafe options are rejected', () => {
  const correlation = correlateEnterpriseEvidenceEvents([event({ eventId: 'a' })])
  assert.equal(reconstructEnterpriseEvidenceTimeline(correlation, { eventIds: ['missing'] }), null)
  assert.throws(() => reconstructEnterpriseEvidenceTimeline(correlation, { maxEntries: 0 }), /maxEntries/)
  assert.throws(() => reconstructEnterpriseEvidenceTimeline(correlation, {
    startAt: '2026-07-19T00:00:00.000Z',
    endAt: '2026-07-18T00:00:00.000Z',
  }), /startAt/)
})
