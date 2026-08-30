import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SINGLE_PROPOSITION_ANSWER_CHAR_LIMIT,
  acceptFreshEvidenceFaithfulnessReview,
  acceptFreshEvidenceSemanticPlan,
  acceptFreshEvidenceSynthesis,
  freshEvidenceSynthesisNeedsNeuralReview,
  type FreshEvidenceSemanticPlan,
} from '../lib/ai/cos/freshEvidenceSynthesisContract.ts'

const sources = [
  { id: 'LIVE1', title: 'Population report', url: 'https://data.example.gov/report', snippet: 'A population-level series reports an overall difference for the measured period.' },
  { id: 'LIVE2', title: 'Conditioned study', url: 'https://research.example.edu/study', snippet: 'A second study uses a narrower comparison basis and reports a smaller residual difference.' },
  { id: 'LIVE3', title: 'Independent series', url: 'https://stats.example.org/series', snippet: 'An independent series reports another population-level estimate.' },
] as any

const scopedPlan: FreshEvidenceSemanticPlan = {
  directBinaryAnswerSafe: false,
  scopes: [
    { scopeId: 'S1', label: 'population-level outcome', finding: 'The broad population measure shows a difference.', evidenceIds: ['LIVE1'] },
    { scopeId: 'S2', label: 'narrower conditioned comparison', finding: 'The narrower comparison reports a smaller residual difference.', evidenceIds: ['LIVE2'] },
  ],
}

const directPlan: FreshEvidenceSemanticPlan = {
  directBinaryAnswerSafe: true,
  scopes: [
    { scopeId: 'S1', label: 'current status', finding: 'The current status is established.', evidenceIds: ['LIVE1'] },
  ],
}

test('semantic planning accepts two materially distinct model-declared scopes without naming the topic in code', () => {
  const accepted = acceptFreshEvidenceSemanticPlan({
    text: JSON.stringify(scopedPlan),
    sources,
  })
  assert.deepEqual(accepted, scopedPlan)
})

test('a model cannot declare binary ambiguity while returning only one scope', () => {
  assert.equal(acceptFreshEvidenceSemanticPlan({
    text: JSON.stringify({
      directBinaryAnswerSafe: false,
      scopes: [{ scopeId: 'S1', label: 'one measurement', finding: 'One finding.', evidenceIds: ['LIVE1'] }],
    }),
    sources,
  }), null)
})

test('semantic scopes cannot cite invented evidence ids', () => {
  assert.equal(acceptFreshEvidenceSemanticPlan({
    text: JSON.stringify({
      directBinaryAnswerSafe: true,
      scopes: [{ scopeId: 'S1', label: 'current status', finding: 'A finding.', evidenceIds: ['LIVE99'] }],
    }),
    sources,
  }), null)
})

test('an unsafe binary scope plan cannot release a bare yes/no answer', () => {
  const accepted = acceptFreshEvidenceSynthesis({
    text: JSON.stringify({
      answer: 'Yes. The evidence shows a difference.',
      evidenceIds: ['LIVE1', 'LIVE2'],
      scopeIds: ['S1', 'S2'],
    }),
    input: 'Is there a difference between these outcomes?',
    sources,
    semanticPlan: scopedPlan,
  })
  assert.equal(accepted, null)
})

test('a scoped answer must preserve every material scope and evidence lineage structurally', () => {
  const accepted = acceptFreshEvidenceSynthesis({
    text: JSON.stringify({
      answer: 'The broad population measure shows a difference, while the narrower conditioned comparison reports a smaller residual; those are different measurements and neither should be silently substituted for the other.',
      evidenceIds: ['LIVE1', 'LIVE2'],
      scopeIds: ['S1', 'S2'],
    }),
    input: 'Is there a difference between these outcomes?',
    sources,
    semanticPlan: scopedPlan,
  })
  assert.ok(accepted)
  assert.deepEqual(accepted.scopeIds, ['S1', 'S2'])
  assert.equal(accepted.semanticPlan.directBinaryAnswerSafe, false)
})

test('dropping one model-declared material scope fails closed before neural faithfulness review', () => {
  assert.equal(acceptFreshEvidenceSynthesis({
    text: JSON.stringify({
      answer: 'The broad population measure shows a difference.',
      evidenceIds: ['LIVE1'],
      scopeIds: ['S1'],
    }),
    input: 'Is there a difference between these outcomes?',
    sources,
    semanticPlan: scopedPlan,
  }), null)
})

test('faithfulness reviewer accepts a clean multi-scope verdict only with empty defect arrays', () => {
  assert.deepEqual(acceptFreshEvidenceFaithfulnessReview({
    text: JSON.stringify({ faithful: true, missingScopeIds: [], collapsedScopeIds: [] }),
    semanticPlan: scopedPlan,
  }), { faithful: true, missingScopeIds: [], collapsedScopeIds: [] })

  assert.equal(acceptFreshEvidenceFaithfulnessReview({
    text: JSON.stringify({ faithful: true, missingScopeIds: ['S2'], collapsedScopeIds: [] }),
    semanticPlan: scopedPlan,
  }), null)
})

test('faithfulness reviewer can flag missing or collapsed model-declared scopes without semantic topic code', () => {
  assert.deepEqual(acceptFreshEvidenceFaithfulnessReview({
    text: JSON.stringify({ faithful: false, missingScopeIds: ['S2'], collapsedScopeIds: ['S1', 'S2'] }),
    semanticPlan: scopedPlan,
  }), { faithful: false, missingScopeIds: ['S2'], collapsedScopeIds: ['S1', 'S2'] })
})

test('faithfulness reviewer fails closed on invented scope ids or an unexplained negative verdict', () => {
  assert.equal(acceptFreshEvidenceFaithfulnessReview({
    text: JSON.stringify({ faithful: false, missingScopeIds: ['S99'], collapsedScopeIds: [] }),
    semanticPlan: scopedPlan,
  }), null)
  assert.equal(acceptFreshEvidenceFaithfulnessReview({
    text: JSON.stringify({ faithful: false, missingScopeIds: [], collapsedScopeIds: [] }),
    semanticPlan: scopedPlan,
  }), null)
})

test('a genuinely single-scope proposition may still lead with a direct binary answer', () => {
  const accepted = acceptFreshEvidenceSynthesis({
    text: JSON.stringify({
      answer: 'Yes. The current status is established by the cited evidence.',
      evidenceIds: ['LIVE1'],
      scopeIds: ['S1'],
    }),
    input: 'Is the current status established?',
    sources,
    semanticPlan: directPlan,
  })
  assert.ok(accepted)
})

test('a single proposition citing a retrieval set still requires a final neural edit', () => {
  assert.equal(freshEvidenceSynthesisNeedsNeuralReview({
    answer: 'The answer is supported, followed by several redundant measurements from the retrieval set.',
    citedSourceIds: ['LIVE1', 'LIVE2', 'LIVE3'],
    singleProposition: true,
    semanticPlan: directPlan,
  }), true)
})

test('an unusually long single-proposition draft still requires neural compression', () => {
  assert.equal(freshEvidenceSynthesisNeedsNeuralReview({
    answer: 'x'.repeat(SINGLE_PROPOSITION_ANSWER_CHAR_LIMIT + 1),
    citedSourceIds: ['LIVE1'],
    singleProposition: true,
    semanticPlan: directPlan,
  }), true)
})

test('multi-scope answers may cite one representative source per scope without being mistaken for a retrieval dump', () => {
  assert.equal(freshEvidenceSynthesisNeedsNeuralReview({
    answer: 'The two measurements support different bounded conclusions and should remain distinct.',
    citedSourceIds: ['LIVE1', 'LIVE2'],
    singleProposition: true,
    semanticPlan: scopedPlan,
  }), false)
})
