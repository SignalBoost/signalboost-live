import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  diagnoseFreshEvidenceSemanticPlan,
  diagnoseFreshEvidenceSynthesis,
  freshEvidenceAnswerContractRepairPrompt,
} from '../lib/ai/cos/freshEvidenceContractRecovery.ts'
import {
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
  presentationMode: 'neutral_evidence_map',
  directBinaryAnswerSafe: false,
  scopes: [
    { scopeId: 'S1', label: 'population-level outcome', finding: 'The broad population measure shows a difference.', evidenceIds: ['LIVE1'] },
    { scopeId: 'S2', label: 'narrower conditioned comparison', finding: 'The narrower comparison reports a smaller residual difference.', evidenceIds: ['LIVE2'] },
  ],
}

const binarySafeMultiScopePlan: FreshEvidenceSemanticPlan = {
  presentationMode: 'direct',
  directBinaryAnswerSafe: true,
  scopes: [
    { scopeId: 'S1', label: 'population-level outcome', finding: 'The broad population measure shows a difference.', evidenceIds: ['LIVE1'] },
    { scopeId: 'S2', label: 'narrower conditioned comparison', finding: 'The narrower comparison also shows a residual difference.', evidenceIds: ['LIVE2'] },
  ],
}

const binaryUnsafeSingleScopePlan: FreshEvidenceSemanticPlan = {
  presentationMode: 'direct',
  directBinaryAnswerSafe: false,
  scopes: [
    { scopeId: 'S1', label: 'bounded current estimate', finding: 'The evidence supports a bounded estimate but not an unqualified binary framing.', evidenceIds: ['LIVE1'] },
  ],
}

const directPlan: FreshEvidenceSemanticPlan = {
  presentationMode: 'direct',
  directBinaryAnswerSafe: true,
  scopes: [
    { scopeId: 'S1', label: 'current status', finding: 'The current status is established.', evidenceIds: ['LIVE1'] },
  ],
}

test('semantic planning accepts a model-declared neutral evidence map without naming the topic in code', () => {
  const accepted = acceptFreshEvidenceSemanticPlan({ text: JSON.stringify(scopedPlan), sources })
  assert.deepEqual(accepted, scopedPlan)
})

test('binary safety is model-owned even when only one semantic scope is needed', () => {
  const encoded = JSON.stringify(binaryUnsafeSingleScopePlan)
  assert.deepEqual(acceptFreshEvidenceSemanticPlan({ text: encoded, sources }), binaryUnsafeSingleScopePlan)
  assert.equal(diagnoseFreshEvidenceSemanticPlan({ text: encoded, sources }), null)
})

test('scope-plan contract keeps scope cardinality independent of presentation mode and binary safety', () => {
  const source = readFileSync(new URL('../lib/ai/cos/freshEvidenceSynthesisContract.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /directBinaryAnswerSafe\s*===\s*false\s*&&\s*scopes\.length\s*<\s*2/)
  assert.match(source, /Do not infer presentationMode from scope count/i)
  assert.match(source, /Choose scope count separately from binary safety and presentation mode/i)
})

test('semantic scopes cannot cite invented evidence ids', () => {
  assert.equal(acceptFreshEvidenceSemanticPlan({
    text: JSON.stringify({ presentationMode: 'direct', directBinaryAnswerSafe: true, scopes: [{ scopeId: 'S1', label: 'current status', finding: 'A finding.', evidenceIds: ['LIVE99'] }] }),
    sources,
  }), null)
})

test('a neutral evidence map can never be binary-safe', () => {
  const invalid = JSON.stringify({ ...scopedPlan, directBinaryAnswerSafe: true })
  assert.equal(acceptFreshEvidenceSemanticPlan({ text: invalid, sources }), null)
  assert.deepEqual(diagnoseFreshEvidenceSemanticPlan({ text: invalid, sources }), { code: 'inconsistent_presentation_mode', repairable: true })
})

test('two scopes plus binary-safe remains valid when the neural presentation mode is direct', () => {
  const encoded = JSON.stringify(binarySafeMultiScopePlan)
  assert.deepEqual(acceptFreshEvidenceSemanticPlan({ text: encoded, sources }), binarySafeMultiScopePlan)
  assert.equal(diagnoseFreshEvidenceSemanticPlan({ text: encoded, sources }), null)
})

test('deterministic recovery never infers presentation mode or binary safety from scope count', () => {
  const source = readFileSync(new URL('../lib/ai/cos/freshEvidenceContractRecovery.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /binary_safe_with_multiple_material_scopes/)
  assert.doesNotMatch(source, /directBinaryAnswerSafe\s*===\s*true\s*&&\s*parsed\.scopes\.length\s*>\s*1/)
  assert.match(source, /not infer presentation mode or binary safety from the number of scopes returned/i)
})

test('a neutral evidence map cannot release an answer beginning with yes or no', () => {
  const text = JSON.stringify({
    answer: 'Yes. The evidence can be divided into a broad population measure and a narrower conditioned comparison.',
    evidenceIds: ['LIVE1', 'LIVE2'],
    scopeIds: ['S1', 'S2'],
  })
  assert.equal(acceptFreshEvidenceSynthesis({ text, input: 'Is there a difference between these outcomes?', sources, semanticPlan: scopedPlan }), null)
  assert.equal(diagnoseFreshEvidenceSynthesis({ text, input: 'Is there a difference between these outcomes?', sources, semanticPlan: scopedPlan })?.code, 'unsafe_binary_lead')
})

test('a binary-unsafe direct single-scope plan also blocks an unsafe bare yes/no answer', () => {
  assert.equal(acceptFreshEvidenceSynthesis({
    text: JSON.stringify({ answer: 'Yes. The estimate exists.', evidenceIds: ['LIVE1'], scopeIds: ['S1'] }),
    input: 'Can this be answered with an unqualified yes or no?', sources, semanticPlan: binaryUnsafeSingleScopePlan,
  }), null)
})

test('a binary-safe direct multi-scope plan may release a direct answer while retaining both scopes', () => {
  const accepted = acceptFreshEvidenceSynthesis({
    text: JSON.stringify({ answer: 'Yes. Both the broad population measure and the narrower conditioned comparison report a difference, although they measure different comparison bases and should not be treated as the same magnitude.', evidenceIds: ['LIVE1', 'LIVE2'], scopeIds: ['S1', 'S2'] }),
    input: 'Is there a difference between these outcomes?', sources, semanticPlan: binarySafeMultiScopePlan,
  })
  assert.ok(accepted)
  assert.deepEqual(accepted.scopeIds, ['S1', 'S2'])
  assert.equal(accepted.semanticPlan.presentationMode, 'direct')
  assert.equal(accepted.semanticPlan.directBinaryAnswerSafe, true)
})

test('a neutral evidence map releases evidence-first prose that preserves every material scope', () => {
  const accepted = acceptFreshEvidenceSynthesis({
    text: JSON.stringify({ answer: 'The available evidence uses two different comparison frames. The broad population measure reports a difference, while the narrower conditioned comparison reports a smaller residual; those are different measurements and should not be silently substituted for each other.', evidenceIds: ['LIVE1', 'LIVE2'], scopeIds: ['S1', 'S2'] }),
    input: 'Is there a difference between these outcomes?', sources, semanticPlan: scopedPlan,
  })
  assert.ok(accepted)
  assert.deepEqual(accepted.scopeIds, ['S1', 'S2'])
  assert.equal(accepted.semanticPlan.presentationMode, 'neutral_evidence_map')
})

test('dropping one model-declared material scope fails closed before neural faithfulness review', () => {
  assert.equal(acceptFreshEvidenceSynthesis({
    text: JSON.stringify({ answer: 'The broad population measure shows a difference.', evidenceIds: ['LIVE1'], scopeIds: ['S1'] }),
    input: 'Is there a difference between these outcomes?', sources, semanticPlan: scopedPlan,
  }), null)
})

test('a repairable answer-contract mismatch is diagnosed instead of becoming an opaque grounding refusal', () => {
  const draft = JSON.stringify({ answer: 'The broad measure and the narrower measure establish different bounded results.', evidenceIds: ['LIVE1', 'LIVE2'] })
  assert.deepEqual(diagnoseFreshEvidenceSynthesis({ text: draft, input: 'Is there a difference between these outcomes?', sources, semanticPlan: scopedPlan }), {
    code: 'missing_scope_ids', repairable: true, draftAnswer: 'The broad measure and the narrower measure establish different bounded results.',
  })
  const prompt = freshEvidenceAnswerContractRepairPrompt({ input: 'Is there a difference between these outcomes?', sources, retrievedAt: '2026-08-30T23:21:30.000Z', semanticPlan: scopedPlan, failedDraftText: draft, failureCode: 'missing_scope_ids' })
  assert.match(prompt, /VALIDATION FAILURE: missing_scope_ids/)
  assert.match(prompt, /answer, evidenceIds, and scopeIds/)
  assert.match(prompt, /do not weaken or bypass the authority\/citation requirements/i)
  assert.match(prompt, /neutral_evidence_map, do not begin with yes\/no or a verdict/i)
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
  assert.deepEqual(acceptFreshEvidenceFaithfulnessReview({ text: JSON.stringify({ faithful: true, missingScopeIds: [], collapsedScopeIds: [] }), semanticPlan: scopedPlan }), { faithful: true, missingScopeIds: [], collapsedScopeIds: [] })
  assert.equal(acceptFreshEvidenceFaithfulnessReview({ text: JSON.stringify({ faithful: true, missingScopeIds: ['S2'], collapsedScopeIds: [] }), semanticPlan: scopedPlan }), null)
})

test('faithfulness reviewer can flag missing or collapsed model-declared scopes without semantic topic code', () => {
  assert.deepEqual(acceptFreshEvidenceFaithfulnessReview({ text: JSON.stringify({ faithful: false, missingScopeIds: ['S2'], collapsedScopeIds: ['S1', 'S2'] }), semanticPlan: scopedPlan }), { faithful: false, missingScopeIds: ['S2'], collapsedScopeIds: ['S1', 'S2'] })
})

test('faithfulness reviewer fails closed on invented scope ids or an unexplained negative verdict', () => {
  assert.equal(acceptFreshEvidenceFaithfulnessReview({ text: JSON.stringify({ faithful: false, missingScopeIds: ['S99'], collapsedScopeIds: [] }), semanticPlan: scopedPlan }), null)
  assert.equal(acceptFreshEvidenceFaithfulnessReview({ text: JSON.stringify({ faithful: false, missingScopeIds: [], collapsedScopeIds: [] }), semanticPlan: scopedPlan }), null)
})

test('a genuinely single-scope direct proposition may still lead with a direct binary answer', () => {
  const accepted = acceptFreshEvidenceSynthesis({
    text: JSON.stringify({ answer: 'Yes. The current status is established by the cited evidence.', evidenceIds: ['LIVE1'], scopeIds: ['S1'] }),
    input: 'Is the current status established?', sources, semanticPlan: directPlan,
  })
  assert.ok(accepted)
})

test('source-count density is presentation quality and never causes a verification refusal', () => {
  assert.equal(freshEvidenceSynthesisNeedsNeuralReview({ answer: 'A concise, grounded answer can cite several supporting sources without becoming factually invalid.', citedSourceIds: ['LIVE1', 'LIVE2', 'LIVE3', 'LIVE4', 'LIVE5', 'LIVE6'], singleProposition: true, semanticPlan: binarySafeMultiScopePlan }), false)
})

test('answer length is presentation quality and never causes a verification refusal', () => {
  assert.equal(freshEvidenceSynthesisNeedsNeuralReview({ answer: 'x'.repeat(2000), citedSourceIds: ['LIVE1'], singleProposition: true, semanticPlan: directPlan }), false)
})

test('the compatibility density hook is explicitly non-blocking', () => {
  const source = readFileSync(new URL('../lib/ai/cos/freshEvidenceSynthesisContract.ts', import.meta.url), 'utf8')
  assert.match(source, /Output density is a presentation-quality preference, never a verification\/release gate/i)
  assert.match(source, /freshEvidenceSynthesisNeedsNeuralReview\(_args:[\s\S]*?return false/)
})

test('multi-scope answers remain governed by semantic faithfulness, not citation-count density', () => {
  assert.equal(freshEvidenceSynthesisNeedsNeuralReview({ answer: 'The two measurements support different bounded conclusions and should remain distinct.', citedSourceIds: ['LIVE1', 'LIVE2'], singleProposition: true, semanticPlan: scopedPlan }), false)
})