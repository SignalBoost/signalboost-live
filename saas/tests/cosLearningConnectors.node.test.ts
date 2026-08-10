import assert from 'node:assert/strict'
import test from 'node:test'
import { newsLearningConnector, scientificLearningConnector, youtubeLearningConnector } from '../lib/cos-core/layers/learning/connectors'

const gap = {
  id: 'gap-source-1',
  subject: 'AI infrastructure',
  question: 'What changed in AI infrastructure?',
  evidence: [],
  priority: 1,
  createdAt: '2026-08-09T00:00:00.000Z',
}

test('source connectors convert approved API results into governed documents', async () => {
  const search = async (query: string, limit: number) => [{
    uri: 'https://example.test/source',
    title: 'Source',
    text: `Evidence for ${query}`,
    observedAt: '2026-08-09T00:00:00.000Z',
    license: 'approved',
  }].slice(0, limit)

  for (const [connector, kind] of [
    [youtubeLearningConnector(search), 'video_transcript'],
    [scientificLearningConnector(search), 'scientific_journal'],
    [newsLearningConnector(search), 'news_article'],
  ] as const) {
    const documents = await connector.acquire(gap)
    assert.equal(documents.length, 1)
    assert.equal(documents[0].sourceKind, kind)
    assert.equal(documents[0].subject, gap.subject)
    assert.match(documents[0].text, /AI infrastructure/)
  }
})

test('connector enforces result limits before learning admission', async () => {
  const search = async () => Array.from({ length: 10 }, (_, i) => ({
    uri: `https://example.test/${i}`,
    text: `document ${i}`,
  }))
  const documents = await newsLearningConnector(search, 3).acquire(gap)
  assert.equal(documents.length, 3)
})
