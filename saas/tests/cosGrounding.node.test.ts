import assert from 'node:assert/strict'
import test from 'node:test'
import { citedKnowledgeEvidenceCount, groundedEvidenceCeiling } from '../lib/ai/cos/groundingConfidence.ts'

test('retrieved context earns no confidence credit until the answer cites durable knowledge', () => {
  assert.equal(citedKnowledgeEvidenceCount({ kg: 0, cl: 0 }), 0)
  assert.equal(groundedEvidenceCeiling(0), 0.78)
})

test('grounded evidence preserves the existing confidence-ceiling bands', () => {
  assert.equal(groundedEvidenceCeiling(1), 0.84)
  assert.equal(groundedEvidenceCeiling(2), 0.90)
  assert.equal(groundedEvidenceCeiling(4), 0.90)
  assert.equal(groundedEvidenceCeiling(5), 0.96)
  assert.equal(groundedEvidenceCeiling(20), 0.96)
})

test('knowledge graph and learned-corpus citations combine for grounding credit', () => {
  assert.equal(citedKnowledgeEvidenceCount({ kg: 1, cl: 0 }), 1)
  assert.equal(citedKnowledgeEvidenceCount({ kg: 1, cl: 1 }), 2)
  assert.equal(citedKnowledgeEvidenceCount({ kg: 2, cl: 3 }), 5)
})

test('invalid citation counts cannot inflate confidence', () => {
  assert.equal(citedKnowledgeEvidenceCount({ kg: -3, cl: Number.NaN }), 0)
  assert.equal(groundedEvidenceCeiling(Number.POSITIVE_INFINITY), 0.78)
})
