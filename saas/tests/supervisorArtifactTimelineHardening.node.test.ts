import test from 'node:test'
import assert from 'node:assert/strict'
import { createSupervisorTimeline } from '../lib/supervisor/event-timeline/index.ts'
import { reviewSupervisorArtifact } from '../lib/supervisor/artifact-redaction/index.ts'

const events = [
  { source:'lease', sourceId:'1', occurredAt:'2026-07-18T10:00:00.000Z', kind:'lease' as const, action:'expired', provider:'vercel', severity:'warning' as const, actorType:'supervisor' as const, metadata:{ token:'secret', note:'safe' } },
  { source:'work', sourceId:'2', occurredAt:'2026-07-18T11:00:00.000Z', kind:'work_item' as const, action:'queued', provider:'github', severity:'info' as const, actorType:'system' as const },
  { source:'incident', sourceId:'3', occurredAt:'2026-07-18T12:00:00.000Z', kind:'incident' as const, action:'opened', provider:'vercel', severity:'critical' as const, actorType:'provider' as const },
]

test('timeline applies bounded multi-field filters and redacts sensitive metadata', () => {
  const timeline = createSupervisorTimeline(events, { provider:'vercel', from:'2026-07-18T09:30:00Z', to:'2026-07-18T10:30:00Z', limit:999 })
  assert.equal(timeline.events.length, 1)
  assert.equal(timeline.events[0].eventId, 'lease:1:expired')
  assert.deepEqual(timeline.events[0].metadata, { note:'safe' })
})

test('timeline rejects inverted windows and clamps negative limits', () => {
  assert.throws(() => createSupervisorTimeline(events, { from:'2026-07-19T00:00:00Z', to:'2026-07-18T00:00:00Z' }), /invalid_timeline_window/)
  assert.equal(createSupervisorTimeline(events, { limit:-4 }).events.length, 0)
})

test('artifact review rejects unsafe references and invalid digests', () => {
  const result = reviewSupervisorArtifact({ artifactId:'a', artifactType:'log', uri:'file:///tmp/token.txt', digest:'bad', metadata:{ authorization:'Bearer abc' } })
  assert.equal(result.status, 'rejected')
  assert.ok(result.reasonCodes.includes('unsafe_reference'))
  assert.ok(result.reasonCodes.includes('invalid_digest'))
  assert.deepEqual(result.metadata, {})
})

test('screenshots require visual review while safe logs may be approved', () => {
  const shot = reviewSupervisorArtifact({ artifactId:'shot-1', artifactType:'screenshot', uri:'artifact://shot-1', digest:'a'.repeat(64) })
  assert.equal(shot.status, 'review_required')
  const log = reviewSupervisorArtifact({ artifactId:'log-1', artifactType:'log', uri:'evidence://log-1', digest:'b'.repeat(64), metadata:{ size:12 } })
  assert.equal(log.status, 'approved')
})
