import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SINGLE_PROPOSITION_ANSWER_CHAR_LIMIT,
  freshEvidenceSynthesisNeedsNeuralReview,
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
