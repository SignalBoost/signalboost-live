import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SINGLE_PROPOSITION_ANSWER_CHAR_LIMIT,
  explainsGroupComparisonScope,
  freshEvidenceSynthesisNeedsNeuralReview,
  requiresGroupComparisonScope,
} from '../lib/ai/cos/freshEvidenceSynthesisContract.ts'

test('a single proposition citing a retrieval set requires a second neural pass', () => {
  assert.equal(freshEvidenceSynthesisNeedsNeuralReview({
    answer: 'Current evidence supports the proposition, followed by several parallel measurements from the retrieval set.',
    citedSourceIds: ['LIVE1', 'LIVE2', 'LIVE3', 'LIVE4'],
    singleProposition: true,
  }), true)
})

test('an unusually long single-proposition draft also requires neural compression', () => {
  assert.equal(freshEvidenceSynthesisNeedsNeuralReview({
    answer: 'x'.repeat(SINGLE_PROPOSITION_ANSWER_CHAR_LIMIT + 1),
    citedSourceIds: ['LIVE1', 'LIVE2'],
    singleProposition: true,
  }), true)
})

test('a concise single-proposition synthesis with representative evidence can be released', () => {
  assert.equal(freshEvidenceSynthesisNeedsNeuralReview({
    answer: 'Yes. The strongest current evidence establishes the aggregate difference, but does not by itself establish a controlled or causal explanation.',
    citedSourceIds: ['LIVE1', 'LIVE2'],
    singleProposition: true,
  }), false)
})

test('multi-proposition answers are not compressed by the single-proposition release boundary', () => {
  assert.equal(freshEvidenceSynthesisNeedsNeuralReview({
    answer: 'The first requested fact is established. The second requested fact is also established from separate evidence.',
    citedSourceIds: ['LIVE1', 'LIVE2', 'LIVE3'],
    singleProposition: false,
  }), false)
})

test('a population-disparity question cannot release a raw gap as proof of like-for-like treatment', () => {
  const input = 'does pay gap btw men and women exist in the US?'
  assert.equal(requiresGroupComparisonScope(input), true)
  const observedProductionShape = 'Yes, a gender pay gap exists. Aggregate data show a difference, and an adjusted study reports a small remaining difference.'
  assert.equal(explainsGroupComparisonScope(observedProductionShape), false)
  assert.equal(freshEvidenceSynthesisNeedsNeuralReview({ input, answer: observedProductionShape, citedSourceIds: ['LIVE1', 'LIVE5'], singleProposition: true }), true)
})

test('a population-disparity answer must preserve the aggregate-to-individual boundary', () => {
  const answer = 'Yes. The aggregate median earnings measure shows a group-level difference. It does not by itself establish that individuals doing the same work were paid differently.'
  assert.equal(explainsGroupComparisonScope(answer), true)
  assert.equal(freshEvidenceSynthesisNeedsNeuralReview({ input: 'is there a disparity between two groups?', answer, citedSourceIds: ['LIVE1'], singleProposition: true }), false)
})
