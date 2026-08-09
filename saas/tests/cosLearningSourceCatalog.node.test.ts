import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_CONTINUOUS_LEARNING_POLICY } from '../lib/cos-core/layers/learning/index'
import { CONTINUOUS_LEARNING_SOURCE_CATALOG, learningSourceProfile } from '../lib/cos-core/layers/learning/sourceCatalog'

test('expanded COS source catalog includes video, libraries, science, news and official sources', () => {
  const kinds = new Set(CONTINUOUS_LEARNING_SOURCE_CATALOG.map((source) => source.kind))
  for (const kind of ['video_transcript', 'library_material', 'scientific_journal', 'news_article', 'official_documentation']) {
    assert.equal(kinds.has(kind as never), true)
    assert.equal(DEFAULT_CONTINUOUS_LEARNING_POLICY.allowedSourceKinds.has(kind as never), true)
  }
})

test('copyrighted media defaults to facts and compact summaries only', () => {
  assert.equal(learningSourceProfile('youtube-transcripts')?.rightsMode, 'facts_and_summary_only')
  assert.equal(learningSourceProfile('scientific-journals')?.rightsMode, 'facts_and_summary_only')
  assert.equal(learningSourceProfile('news')?.rightsMode, 'facts_and_summary_only')
  assert.equal(learningSourceProfile('libraries-copyrighted')?.rightsMode, 'facts_and_summary_only')
  assert.equal(learningSourceProfile('libraries-public-domain')?.rightsMode, 'full_text_allowed')
})
