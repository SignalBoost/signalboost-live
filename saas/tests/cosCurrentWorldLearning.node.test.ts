import assert from 'node:assert/strict'
import test from 'node:test'
import { currentWorldKnowledgeGaps, isCurrentWorldLearningAdapter } from '../lib/ai/cos/currentWorldLearning.ts'

test('current-world curriculum is broad, bounded, and date-aware', () => {
  const gaps = currentWorldKnowledgeGaps(new Date('2026-08-22T04:30:00Z'))
  assert.equal(gaps.length, 6)
  assert.ok(gaps.every(gap => gap.id.startsWith('current-world:')))
  assert.ok(gaps.every(gap => gap.subject.includes('2026')))
  const text = gaps.map(gap => `${gap.subject} ${gap.question}`).join('\n')
  assert.match(text, /major world events/i)
  assert.match(text, /deaths|notable people/i)
  assert.match(text, /government leadership|election/i)
  assert.match(text, /business technology/i)
  assert.match(text, /cybersecurity/i)
  assert.match(text, /science space/i)
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
