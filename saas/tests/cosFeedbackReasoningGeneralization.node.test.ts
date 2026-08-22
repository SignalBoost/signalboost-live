import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const generalization = read('../lib/ai/cos/cognitiveFeedbackGeneralization.ts')
const feedbackRoute = read('../app/api/assistant/feedback/route.ts')

test('explicit feedback is abstracted into a transferable procedure, never copied as factual truth', () => {
  assert.match(generalization, /GENERALIZED PROCEDURAL REASONING candidate/)
  assert.match(generalization, /NOT verified factual truth/)
  assert.match(generalization, /Learn a reusable method, not the answer to this one question/)
  assert.match(generalization, /Do not encode names, places, dates, numeric answers, or one-off facts/)
  assert.match(generalization, /one_off_fact_only/)
})

test('feedback reflection creates only a non-live encountered skill candidate', () => {
  assert.match(generalization, /status: 'encountered'/)
  assert.match(generalization, /evaluator_approved: false/)
  assert.match(generalization, /understanding_approved: false/)
  assert.match(generalization, /never inject until status is validated, learned, or mastered/)
  assert.match(generalization, /candidate_encountered_requires_independent_validation/)
  assert.doesNotMatch(generalization, /status: 'validated'/)
})

test('feedback-derived candidates inherit structural reasoning triggers from the failed question shape', () => {
  assert.match(generalization, /detectCognitiveReasoningTriggers\(input\.prompt\)/)
  assert.match(generalization, /reasoningTriggers: triggers/)
  assert.match(generalization, /procedureWithTriggers/)
})

test('feedback-generated exercises are practice only and can never masquerade as holdouts', () => {
  assert.match(generalization, /teacher_lesson_id: null/)
  assert.match(generalization, /exercise_kind: 'practice'/)
  assert.match(generalization, /generation_source: 'local_generator'/)
  assert.match(generalization, /cannot_count_as_independent_holdout: true/)
})

test('feedback endpoint returns promptly and schedules reflection after the response lifecycle', () => {
  assert.match(feedbackRoute, /import \{ after, NextRequest, NextResponse \} from 'next\/server'/)
  assert.match(feedbackRoute, /feedbackType === 'negative' \|\| feedbackType === 'correction'/)
  assert.match(feedbackRoute, /after\(async \(\) =>/)
  assert.match(feedbackRoute, /generalizeFeedbackIntoCognitiveSkill\(feedbackInput\)/)
  assert.match(feedbackRoute, /positive_feedback_outcome_only/)
})

test('a feedback-derived candidate never changes fact or skill promotion directly', () => {
  assert.match(feedbackRoute, /promotion: \{\s*fact: false,\s*skill: false,/s)
  assert.match(feedbackRoute, /requires_independent_validation_before_live_use/)
  assert.match(feedbackRoute, /automaticPromotion: false/)
})
