import assert from 'node:assert/strict'
import test from 'node:test'
import { currentWorldKnowledgeGaps, currentWorldAdapterDue, isCurrentWorldLearningAdapter } from '../lib/ai/cos/currentWorldLearning.ts'

test('current-world curriculum is broad, bounded, date-aware, and rotates its research focus hourly', () => {
  const first = currentWorldKnowledgeGaps(new Date('2026-08-22T04:30:00Z'))
  const next = currentWorldKnowledgeGaps(new Date('2026-08-22T05:30:00Z'))
  assert.equal(first.length, 6)
  assert.equal(next.length, 6)
  assert.ok(first.every(gap => gap.id.startsWith('current-world:')))
  assert.ok(first.every(gap => gap.subject.includes('2026')))
  assert.notDeepEqual(first.map(gap => gap.id), next.map(gap => gap.id))
  assert.notDeepEqual(first.map(gap => gap.subject), next.map(gap => gap.subject))
  const text = first.map(gap => `${gap.subject} ${gap.question}`).join('\n')
  assert.match(text, /major world events/i)
  assert.match(text, /deaths|notable people/i)
  assert.match(text, /government leadership|election/i)
  assert.match(text, /business technology/i)
  assert.match(text, /cybersecurity/i)
  assert.match(text, /science space/i)
})

test('same hourly focus repeats only after the bounded rotation, not every hour', () => {
  const h4 = currentWorldKnowledgeGaps(new Date('2026-08-22T04:30:00Z'))
  const h12 = currentWorldKnowledgeGaps(new Date('2026-08-22T12:30:00Z'))
  assert.equal(h4[0]?.subject, h12[0]?.subject)
  assert.equal(h4[0]?.id.split(':').at(-1), h12[0]?.id.split(':').at(-1))
})

test('durable current-world curriculum excludes high-frequency scalar facts', () => {
  const text = currentWorldKnowledgeGaps(new Date('2026-08-22T04:30:00Z'))
    .map(gap => `${gap.subject} ${gap.question}`)
    .join('\n')
  assert.doesNotMatch(text, /weather forecast|stock price|sports score|exchange rate/i)
})

test('current-world acquisition uses general reference/news/official sources, not narrow academic adapters', () => {
  assert.equal(isCurrentWorldLearningAdapter({ id: 'reference' }), true)
  assert.equal(isCurrentWorldLearningAdapter({ id: 'gdelt' }), true)
  assert.equal(isCurrentWorldLearningAdapter({ id: 'official_docs' }), true)
  assert.equal(isCurrentWorldLearningAdapter({ id: 'tech_feeds' }), true)
  assert.equal(isCurrentWorldLearningAdapter({ id: 'crossref' }), false)
  assert.equal(isCurrentWorldLearningAdapter({ id: 'openalex' }), false)
  assert.equal(isCurrentWorldLearningAdapter({ id: 'youtube_transcript' }), false)
})

test('a persistently failing GDELT is probed periodically while healthy sources continue hourly', () => {
  assert.equal(currentWorldAdapterDue({ id: 'reference' }, new Date('2026-08-22T05:00:00Z')), true)
  assert.equal(currentWorldAdapterDue({ id: 'official_docs' }, new Date('2026-08-22T05:00:00Z')), true)
  assert.equal(currentWorldAdapterDue({ id: 'gdelt' }, new Date('2026-08-22T05:00:00Z')), false)
  assert.equal(currentWorldAdapterDue({ id: 'gdelt' }, new Date('2026-08-22T06:00:00Z')), true)
  assert.equal(currentWorldAdapterDue({ id: 'gdelt' }, new Date('2026-08-22T12:00:00Z')), true)
  assert.equal(currentWorldAdapterDue({ id: 'crossref' }, new Date('2026-08-22T06:00:00Z')), false)
})
