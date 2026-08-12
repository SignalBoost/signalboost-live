// saas/tests/cosEvidenceCitation.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { citedEvidence } from '../lib/ai/cos/reasonerOutput'

test('citations are counted per unique labelled item', () => {
  const answer = 'The plan flipped after a statistics refresh [CL2]. Pool starvation fits the wait profile [CL2][KG1]. Nothing in memory applied.'
  const cited = citedEvidence(answer)
  assert.equal(cited.cl, 1, 'the same item cited twice counts once')
  assert.equal(cited.kg, 1)
  assert.equal(cited.em, 0)
})

test('an answer with no citations claims no evidence use', () => {
  const cited = citedEvidence('Generic latency advice mentioning CL and KG in prose but citing nothing.')
  assert.deepEqual(cited, { kg: 0, cl: 0, em: 0 })
})

test('bracketed text that is not a label does not count', () => {
  const cited = citedEvidence('See [CLARIFICATION] and [KGB] and [EM] — none of these are evidence labels.')
  assert.deepEqual(cited, { kg: 0, cl: 0, em: 0 })
})
