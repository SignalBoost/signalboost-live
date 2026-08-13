// saas/tests/cosEvidenceCitation.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { citedEvidence, citedIndexedValues, citedLabelIndices } from '../lib/ai/cos/reasonerOutput'
import { citedKnowledgeEvidenceCount } from '../lib/ai/cos/groundingConfidence'

test('citations are counted per unique labelled item', () => {
  const answer = 'The plan flipped after a statistics refresh [CL2]. Pool starvation fits the wait profile [CL2][KG1]. Apply the validated diagnostic ordering [SK1]. Nothing in memory applied.'
  const cited = citedEvidence(answer)
  assert.equal(cited.cl, 1, 'the same item cited twice counts once')
  assert.equal(cited.kg, 1)
  assert.equal(cited.em, 0)
  assert.equal(cited.sk, 1)
})

test('procedural skills do not count as factual grounding', () => {
  const cited = citedEvidence('Use the validated diagnostic method [SK1][SK2].')
  assert.equal(cited.sk, 2)
  assert.equal(citedKnowledgeEvidenceCount(cited), 0)
})

test('an answer with no citations claims no evidence use', () => {
  const cited = citedEvidence('Generic latency advice mentioning CL, KG and SK in prose but citing nothing.')
  assert.deepEqual(cited, { kg: 0, cl: 0, em: 0, sk: 0 })
})

test('bracketed text that is not a label does not count', () => {
  const cited = citedEvidence('See [CLARIFICATION] and [KGB] and [EM] and [SKILL] — none of these are evidence labels.')
  assert.deepEqual(cited, { kg: 0, cl: 0, em: 0, sk: 0 })
})

test('cited labels map only to values supplied in the current turn', () => {
  const answer = 'Apply the second method [SK2], then the first [SK1]. Reusing [SK2] does not double count. [SK9] is outside the supplied set.'
  assert.deepEqual(citedLabelIndices(answer, 'SK'), [2, 1, 9])
  assert.deepEqual(citedIndexedValues(answer, 'SK', ['skill-a', 'skill-b']), ['skill-b', 'skill-a'])
})
