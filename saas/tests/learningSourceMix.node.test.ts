// saas/tests/learningSourceMix.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { DEFAULT_LEARNING_SOURCE_CAPS, learningSourceCap } from '../lib/cos-core/layers/learning/learningSourceCaps.ts'

const liveSources = fs.readFileSync(
  path.join(process.cwd(), 'lib/cos-core/layers/learning/liveSources.ts'), 'utf8')

test('an env override is bounded, and anything unusable falls back to the measured default', () => {
  assert.equal(learningSourceCap('8', 6), 8)
  assert.equal(learningSourceCap(99, 6), 10, 'a cap above the API page size is clamped')
  for (const bad of [undefined, '', 'lots', 0, -3, Number.NaN, {}]) {
    assert.equal(learningSourceCap(bad, 6), 6, String(bad))
  }
})

test('query-targeted scholarly sources are given more room than the feeds', () => {
  const caps = DEFAULT_LEARNING_SOURCE_CAPS
  assert.ok(caps.crossref > caps.official_docs, `${caps.crossref} vs ${caps.official_docs}`)
  assert.ok(caps.openalex > caps.official_docs)
  assert.ok(caps.europe_pmc > caps.official_docs)
})

test('europe_pmc stays below its peers because each result may pull full text', () => {
  assert.ok(DEFAULT_LEARNING_SOURCE_CAPS.europe_pmc < DEFAULT_LEARNING_SOURCE_CAPS.crossref)
  assert.ok(DEFAULT_LEARNING_SOURCE_CAPS.europe_pmc >= 2, 'still worth querying')
})

test('every source keeps a real allocation — none is switched off', () => {
  for (const [source, cap] of Object.entries(DEFAULT_LEARNING_SOURCE_CAPS)) {
    assert.ok(cap >= 1, `${source} would contribute nothing`)
    assert.ok(cap <= 10, `${source} exceeds the endpoint page size`)
  }
})

test('the adapter list reads its caps from this table rather than inline numbers', () => {
  for (const source of Object.keys(DEFAULT_LEARNING_SOURCE_CAPS)) {
    assert.match(liveSources, new RegExp(`DEFAULT_LEARNING_SOURCE_CAPS\\.${source}\\b`), source)
  }
  assert.ok(!/scientificLearningConnector\([a-zA-Z]+,\s*\d/.test(liveSources), 'a scholarly cap is still inline')
  assert.ok(!/officialDocsLearningConnector\([^,]+,\s*\d/.test(liveSources), 'the feed cap is still inline')
})
