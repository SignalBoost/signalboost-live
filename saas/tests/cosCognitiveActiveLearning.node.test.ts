import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  buildLocalPracticeGenerationPrompt,
  evaluateAnswerAgainstRubric,
  parseCognitiveSkillDraft,
  parseTeacherEvaluation,
  skillKeyForDraft,
  validateCognitiveSkillDraft,
} from '../lib/ai/cos/cognitiveSkillCandidate'

const DRAFT = {
  title: 'Diagnose segmented latency regressions',
  description: 'Use asymmetric impact and segmented telemetry to rank mechanisms, test them read-only, and falsify weak explanations on unseen cases.',
  problemClass: 'tenant-segmented tail latency diagnosis',
  prerequisites: ['request segmentation'],
  procedureSteps: ['identify the affected segment', 'rank mechanisms that explain the asymmetry', 'test with read-only evidence'],
  discriminatingSignals: ['segment-only impact', 'stable aggregate load'],
  tools: ['traces', 'metrics'],
  observables: ['queue wait by tenant', 'downstream span duration'],
  falsifiers: ['same wait across segments', 'same downstream path distribution'],
  commonFailureModes: ['generic component lists'],
  prohibitedActions: ['mutating production diagnostics'],
}

test('teacher reflection becomes a generalized skill candidate, not a copied answer', () => {
  const draft = parseCognitiveSkillDraft(JSON.stringify(DRAFT))
  assert.ok(draft)
  assert.equal(validateCognitiveSkillDraft(draft!).ok, true)
  assert.equal(skillKeyForDraft(draft!), skillKeyForDraft({ ...draft!, title: 'different display title' }))
})

test('memorization-shaped candidates are rejected', () => {
  const draft = parseCognitiveSkillDraft(JSON.stringify({ ...DRAFT, description: 'Always answer exactly by repeating the teacher response.', falsifiers: [] }))
  assert.ok(draft)
  const result = validateCognitiveSkillDraft(draft!)
  assert.equal(result.ok, false)
  assert.ok(result.reasons.includes('memorization_not_generalization'))
  assert.ok(result.reasons.includes('insufficient_falsifiers'))
})

test('local generation is practice and explicitly cannot be held-out validation', () => {
  const prompt = buildLocalPracticeGenerationPrompt({ sourcePrompt: 'source case', draft: DRAFT })
  assert.match(prompt, /PRACTICE exercises/i)
  assert.match(prompt, /can never count as held-out validation/i)
})

test('independent teacher evaluation requires three unseen holdouts', () => {
  const variant = (key: string) => ({ variantKey: key, prompt: `case ${key}`, rubric: { requiredConceptGroups: [['signal'], ['falsifier']], forbiddenPatterns: [], minimumConceptCoverage: 0.5, minimumAnswerCharacters: 120 } })
  assert.ok(parseTeacherEvaluation(JSON.stringify({ candidateApproved: true, candidateScore: 0.9, reason: 'ok', understanding: variant('u'), holdouts: [variant('1'), variant('2'), variant('3')] })))
  assert.equal(parseTeacherEvaluation(JSON.stringify({ candidateApproved: true, candidateScore: 0.9, reason: 'incomplete', understanding: variant('u'), holdouts: [variant('1')] })), null)
})

test('deterministic rubric requires concepts and rejects prohibited behavior', () => {
  const rubric = { requiredConceptGroups: [['queue wait', 'queueing'], ['tenant', 'premium'], ['falsifier', 'rule out']], forbiddenPatterns: ['restart production'], minimumConceptCoverage: 2 / 3, minimumAnswerCharacters: 120 }
  const good = evaluateAnswerAgainstRubric('Premium tenant requests show queue wait before the handler. Compare queueing by tenant and use absence of that wait as a falsifier to rule out the bulkhead hypothesis. Existing traces and metrics are sufficient.', rubric)
  assert.equal(good.pass, true)
  const unsafe = evaluateAnswerAgainstRubric('Premium tenant requests show queue wait. A falsifier is no queueing difference. We should restart production to see whether the symptom clears before continuing.', rubric)
  assert.equal(unsafe.pass, false)
})

test('database schema enforces the practice/holdout boundary and auditable promotion', () => {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const migration = readFileSync(`${here}../supabase/migrations/20260813_cos_active_learning_queue.sql`, 'utf8')
  assert.match(migration, /exercise_kind <> 'holdout' or generation_source <> 'local_generator'/)
  assert.match(migration, /cos_learning_promotions/)
  assert.match(migration, /cos_record_cognitive_practice_result/)
})
