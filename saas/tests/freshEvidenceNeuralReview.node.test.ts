import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  diagnoseFreshEvidenceSemanticPlan,
  diagnoseFreshEvidenceSynthesis,
  freshEvidenceAnswerContractRepairPrompt,
} from '../lib/ai/cos/freshEvidenceContractRecovery.ts'
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

const binarySafeMultiScopePlan: FreshEvidenceSemanticPlan = {
  directBinaryAnswerSafe: true,
  scopes: [
    { scopeId: 'S1', label: 'population-level outcome', finding: 'The broad population measure shows a difference.', evidenceIds: ['LIVE1'] },
    { scopeId: 'S2', label: 'narrower conditioned comparison', finding: 'The narrower comparison also shows a residual difference.', evidenceIds: ['LIVE2'] },
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

test('the observed Production shape — two scopes plus binary-safe — remains a valid neural decision', () => {
  const encoded = JSON.stringify(binarySafeMultiScopePlan)
  assert.deepEqual(acceptFreshEvidenceSemanticPlan({ text: encoded, sources }), binarySafeMultiScopePlan)
  assert.equal(diagnoseFreshEvidenceSemanticPlan({ text: encoded, sources }), null)
})

test('deterministic recovery never infers binary safety from scope count', () => {
  const source = readFileSync(new URL('../lib/ai/cos/freshEvidenceContractRecovery.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /binary_safe_with_multiple_material_scopes/)
  assert.doesNotMatch(source, /directBinaryAnswerSafe\s*===\s*true\s*&&\s*parsed\.scopes\.length\s*>\s*1/)
  assert.match(source, /number of scopes alone must not determine that boolean/i)
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

test('a binary-safe multi-scope plan may release a direct answer while retaining both scopes', () => {
  const accepted = acceptFreshEvidenceSynthesis({
    text: JSON.stringify({
      answer: 'Yes. Both the broad population measure and the narrower conditioned comparison report a difference, although they measure different comparison bases and should not be treated as the same magnitude.',
      evidenceIds: ['LIVE1', 'LIVE2'],
      scopeIds: ['S1', 'S2'],
    }),
    input: 'Is there a difference between these outcomes?',
    sources,
    semanticPlan: binarySafeMultiScopePlan,
  })
  assert.ok(accepted)
  assert.deepEqual(accepted.scopeIds, ['S1', 'S2'])
  assert.equal(accepted.semanticPlan.directBinaryAnswerSafe, true)
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

test('a repairable answer-contract mismatch is diagnosed instead of becoming an opaque grounding refusal', () => {
  const draft = JSON.stringify({
    answer: 'The broad measure and the narrower measure establish different bounded results.',
    evidenceIds: ['LIVE1', 'LIVE2'],
  })
  assert.deepEqual(diagnoseFreshEvidenceSynthesis({
    text: draft,
    input: 'Is there a difference between these outcomes?',
    sources,
    semanticPlan: scopedPlan,
  }), {
    code: 'missing_scope_ids',
    repairable: true,
    draftAnswer: 'The broad measure and the narrower measure establish different bounded results.',
  })
  const prompt = freshEvidenceAnswerContractRepairPrompt({
    input: 'Is there a difference between these outcomes?',
    sources,
    retrievedAt: '2026-08-30T23:21:30.000Z',
    semanticPlan: scopedPlan,
    failedDraftText: draft,
    failureCode: 'missing_scope_ids',
  })
  assert.match(prompt, /VALIDATION FAILURE: missing_scope_ids/)
  assert.match(prompt, /answer, evidenceIds, and scopeIds/)
  assert.match(prompt, /do not weaken or bypass the authority\/citation requirements/i)
})

test('the live local state machine has bounded plan and answer-contract repair phases before refusal', () => {
  const source = readFileSync(new URL('../lib/ai/cos/freshEvidenceLocalSynthesis.ts', import.meta.url), 'utf8')
  assert.match(source, /phase: 'scope_plan_repair'/)
  assert.match(source, /phase: 'contract_repair'/)
  assert.match(source, /diagnoseFreshEvidenceSemanticPlan/)
  assert.match(source, /diagnoseFreshEvidenceSynthesis/)
  assert.match(source, /repairAnswerContract/)
  assert.match(source, /failureCode: args\.diagnosis\.code/)
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
