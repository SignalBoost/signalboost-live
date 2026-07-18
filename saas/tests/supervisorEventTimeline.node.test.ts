import test from 'node:test'
import assert from 'node:assert/strict'
import { createSupervisorTimeline, type SupervisorTimelineSource } from '../lib/supervisor/index.ts'

const event = (overrides: Partial<SupervisorTimelineSource> = {}): SupervisorTimelineSource => ({
  source: 'supervisor_work_items',
  sourceId: 'work-1',
  occurredAt: '2026-07-18T20:00:00.000Z',
  kind: 'work_item',
  action: 'queued',
  incidentId: 'incident-1',
  correlationId: 'correlation-1',
  provider: 'github',
  ...overrides,
})

test('creates a stable newest-first timeline', () => {
  const timeline = createSupervisorTimeline([
    event(),
    event({ sourceId: 'work-2', occurredAt: '2026-07-18T20:01:00.000Z', action: 'leased' }),
  ])
  assert.equal(timeline.events[0].sourceId, 'work-2')
  assert.equal(timeline.schemaVersion, 'supervisor-timeline-v1')
})

test('deduplicates identical source events', () => {
  const source = event()
  const timeline = createSupervisorTimeline([source, source])
  assert.equal(timeline.events.length, 1)
})

test('filters by incident and correlation', () => {
  const timeline = createSupervisorTimeline([
    event(),
    event({ sourceId: 'work-2', incidentId: 'incident-2', correlationId: 'correlation-2' }),
  ], { incidentId: 'incident-1', correlationId: 'correlation-1' })
  assert.equal(timeline.events.length, 1)
})

test('drops invalid timestamps and unsafe metadata shapes', () => {
  const timeline = createSupervisorTimeline([
    event({ sourceId: 'invalid', occurredAt: 'not-a-date' }),
    event({ metadata: { attempt: 2, approved: true, secret: { token: 'hidden' }, list: ['hidden'] } }),
  ])
  assert.deepEqual(timeline.events[0].metadata, { approved: true, attempt: 2 })
})

test('reports distinct incident, correlation, and critical totals', () => {
  const timeline = createSupervisorTimeline([
    event({ severity: 'critical' }),
    event({ sourceId: 'work-2', incidentId: 'incident-2', correlationId: 'correlation-2' }),
  ])
  assert.deepEqual(timeline.totals, { events: 2, incidents: 2, correlations: 2, critical: 1 })
})

test('applies a bounded result limit', () => {
  const timeline = createSupervisorTimeline([
    event(),
    event({ sourceId: 'work-2', action: 'leased' }),
  ], { limit: 1 })
  assert.equal(timeline.events.length, 1)
})
