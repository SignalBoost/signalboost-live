import assert from 'node:assert/strict'
import test from 'node:test'
import { decideCosUserFeedbackExperience } from '../lib/ai/cos/cognitiveUserFeedback.ts'

const base = {
  userId: 'user-1',
  conversationId: 'conversation-1',
  prompt: 'Explain why this Kubernetes pod is pending.',
  assistantContent: 'Inspect scheduling events and resource requests first.',
} as const

test('positive feedback is episodic quality evidence, never automatic knowledge', () => {
  const decision = decideCosUserFeedbackExperience({ ...base, feedbackType: 'positive' })
  assert.equal(decision.eligible, true)
  assert.equal(decision.success, true)
  assert.equal(decision.score, 1)
  assert.equal(decision.evidence.semantics, 'user_feedback_signal_not_verified_truth')
  assert.equal(decision.evidence.automaticFactPromotionAllowed, false)
  assert.equal(decision.evidence.automaticSkillPromotionAllowed, false)
  assert.equal(decision.evidence.confidenceBonusAllowed, false)
  assert.equal(decision.evidence.executionAuthorityChangeAllowed, false)
  assert.equal(decision.evidence.curriculumSignalEligible, false)
  assert.equal('assistantContent' in decision.evidence, false)
  assert.equal('answer' in decision.evidence, false)
  assert.match(String(decision.evidence.promptHash), /^[a-f0-9]{64}$/)
  assert.match(String(decision.evidence.assistantResponseHash), /^[a-f0-9]{64}$/)
})

test('negative feedback becomes curriculum-eligible evidence without factual authority', () => {
  const decision = decideCosUserFeedbackExperience({ ...base, feedbackType: 'negative' })
  assert.equal(decision.eligible, true)
  assert.equal(decision.success, false)
  assert.equal(decision.score, 0)
  assert.equal(decision.evidence.curriculumSignalEligible, true)
  assert.equal(decision.evidence.automaticFactPromotionAllowed, false)
})

test('feedback uses the shared bounded problem taxonomy', () => {
  const decision = decideCosUserFeedbackExperience({
    ...base,
    prompt: 'Who is the current President of the United States?',
    feedbackType: 'negative',
  })
  assert.equal(decision.subject, 'current public facts')
})

test('correction retains bounded user text explicitly as unverified feedback', () => {
  const decision = decideCosUserFeedbackExperience({
    ...base,
    feedbackType: 'correction',
    correctionText: `  The pod is blocked by an untolerated taint.${' x'.repeat(3000)}  `,
  })
  assert.equal(decision.eligible, true)
  assert.equal(decision.success, null)
  assert.equal(decision.score, null)
  assert.equal(decision.evidence.correctionSemantics, 'unverified_user_correction_requires_validation')
  assert.equal(decision.evidence.curriculumSignalEligible, true)
  assert.ok(String(decision.evidence.correctionText).length <= 4000)
  assert.equal(decision.evidence.verifiedOutcome, false)
})

test('correction without correction text fails closed', () => {
  const decision = decideCosUserFeedbackExperience({ ...base, feedbackType: 'correction', correctionText: '   ' })
  assert.equal(decision.eligible, false)
  assert.equal(decision.reason, 'correction_text_required')
})

test('identical feedback is deterministic while different corrections get distinct experience ids', () => {
  const a = decideCosUserFeedbackExperience({ ...base, feedbackType: 'negative' })
  const b = decideCosUserFeedbackExperience({ ...base, feedbackType: 'negative' })
  const c = decideCosUserFeedbackExperience({ ...base, feedbackType: 'correction', correctionText: 'Check the taint.' })
  const d = decideCosUserFeedbackExperience({ ...base, feedbackType: 'correction', correctionText: 'Check the PVC.' })
  assert.equal(a.experienceHash, b.experienceHash)
  assert.notEqual(c.experienceHash, d.experienceHash)
  assert.notEqual(a.experienceHash, c.experienceHash)
})

test('the same assistant wording under a different prompt is a distinct learning event', () => {
  const a = decideCosUserFeedbackExperience({ ...base, feedbackType: 'negative' })
  const b = decideCosUserFeedbackExperience({
    ...base,
    prompt: 'Explain why this deployment is unavailable.',
    feedbackType: 'negative',
  })
  assert.notEqual(a.promptHash, b.promptHash)
  assert.equal(a.assistantResponseHash, b.assistantResponseHash)
  assert.notEqual(a.experienceHash, b.experienceHash)
  assert.notEqual(a.sourceRef, b.sourceRef)
})
