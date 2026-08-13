import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  buildLocalPracticeGenerationPrompt,
  evaluateAnswerAgainstRubric,
  parseCognitiveSkillDraft,
  parsePracticeVariants,
  parseTeacherEvaluation,
  skillKeyForDraft,
  validateCognitiveSkillDraft,
} from '../lib/ai/cos/cognitiveSkillCandidate'

const VALID_DRAFT = {
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

test('teacher reflection must parse into a generalized procedural candidate with stable keying', () => {
  const draft = parseCognitiveSkillDraft(JSON.stringify(VALID_DRAFT))
  assert.ok(draft)
  assert.equal(validateCognitiveSkillDraft(draft!).ok, true)
  assert.equal(skillKeyForDraft(draft!), skillKeyForDraft({ ...draft!, title: 'A different display title' }))
  assert.match(skillKeyForDraft(draft!), /^tenant-segmented-tail-latency-diagnosis-/)
})

test('structural review rejects memorization-shaped or non-falsifiable candidates', () => {
  const weak = parseCognitiveSkillDraft(JSON.stringify({
    ...VALID_DRAFT,
    description: 'Always answer exactly by repeating the teacher response for this prompt.',
    falsifiers: [],
  }))
  assert.ok(weak)
  const result = validateCognitiveSkillDraft(weak!)
  assert.equal(result.ok, false)
  assert.ok(result.reasons.includes('insufficient_falsifiers'))
  assert.ok(result.reasons.includes('memorization_not_generalization'))
})

test('locally generated variants are explicitly practice material, not hidden holdouts', () => {
  const prompt = buildLocalPracticeGenerationPrompt({ sourcePrompt: 'source case', draft: VALID_DRAFT })
  assert.match(prompt, /PRACTICE exercises/i)
  assert.match(prompt, /can never count as held-out validation/i)
  assert.match(prompt, /Do not provide answers/i)
})

test('practice variant parsing normalizes deterministic rubrics without exposing an answer', () => {
  const variants = parsePracticeVariants(JSON.stringify({ variants: [{
    variantKey: 'practice-a',
    prompt: 'Only premium tenants queue before the handler. Diagnose the mechanism.',
    rubric: {
      requiredConceptGroups: [['queue wait', 'queueing'], ['tenant', 'premium']],
      forbiddenPatterns: ['restart production'],
      minimumConceptCoverage: 0.6,
      minimumAnswerCharacters: 200,
    },
  }] }))
  assert.equal(variants.length, 1)
  assert.equal(variants[0].rubric.requiredConceptGroups.length, 2)
  assert.equal(variants[0].rubric.minimumAnswerCharacters, 200)
})

test('teacher evaluation parser requires a complete three-case holdout exam', () => {
  const variant = (key: string) => ({
    variantKey: key,
    prompt: `unseen case ${key}`,
    rubric: { requiredConceptGroups: [['signal'], ['falsifier']], forbiddenPatterns: [], minimumConceptCoverage: 0.5, minimumAnswerCharacters: 120 },
  })
  const complete = parseTeacherEvaluation(JSON.stringify({
    candidateApproved: true,
    candidateScore: 0.91,
    reason: 'general and falsifiable',
    understanding: variant('u1'),
    holdouts: [variant('h1'), variant('h2'), variant('h3')],
  }))
  assert.ok(complete)
  assert.equal(complete!.holdouts.length, 3)

  const incomplete = parseTeacherEvaluation(JSON.stringify({
    candidateApproved: true,
    candidateScore: 0.91,
    reason: 'not enough exam breadth',
    understanding: variant('u1'),
    holdouts: [variant('h1'), variant('h2')],
  }))
  assert.equal(incomplete, null)
})

test('deterministic rubric scoring rewards concept coverage and rejects forbidden behavior', () => {
  const rubric = {
    requiredConceptGroups: [['queue wait', 'queueing'], ['tenant', 'premium'], ['falsifier', 'rule out']],
    forbiddenPatterns: ['restart production'],
    minimumConceptCoverage: 2 / 3,
    minimumAnswerCharacters: 120,
  }
  const good = evaluateAnswerAgainstRubric(
    'Premium tenant requests show queue wait before the handler. Compare that queueing time by tenant and use the absence of the wait as a falsifier to rule out the bulkhead hypothesis. Existing traces and metrics are enough to distinguish it.',
    rubric,
  )
  assert.equal(good.pass, true)
  assert.ok(good.coverage >= 2 / 3)

  const unsafe = evaluateAnswerAgainstRubric(
    'Premium tenant requests show queue wait. The falsifier is no queueing difference. We should restart production to see whether it clears the symptom before continuing.',
    rubric,
  )
  assert.equal(unsafe.pass, false)
  assert.deepEqual(unsafe.forbiddenMatches, ['restart production'])
})

test('database schema prevents local-generator exercises from becoming holdouts', () => {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const migration = readFileSync(`${here}../supabase/migrations/20260813_cos_active_learning_queue.sql`, 'utf8')
  assert.match(migration, /exercise_kind <> 'holdout' or generation_source <> 'local_generator'/)
  assert.match(migration, /cos_learning_promotions/)
  assert.match(migration, /cos_record_cognitive_practice_result/)
})
