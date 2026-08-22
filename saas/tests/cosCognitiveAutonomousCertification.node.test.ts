import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  inferCertificationProfileForDraft,
  reviewCuratedCertificationCandidate,
} from '../lib/ai/cos/cognitiveCertificationProfiles.ts'
import { evaluateCognitiveSkillEligibility } from '../lib/ai/cos/cognitiveLearningLifecycle.ts'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

const ambiguityDraft = {
  title: 'Resolve material ambiguity before answering',
  description: 'Resolve context, referents, comparison baselines and materially different interpretations before committing to an answer.',
  problemClass: 'ambiguity and context resolution',
  prerequisites: [],
  procedureSteps: [
    'Identify the unresolved referent or baseline.',
    'Resolve it from supplied context without inventing facts.',
    'Branch or clarify when different interpretations change the answer.',
  ],
  discriminatingSignals: ['unresolved referent', 'missing comparison baseline'],
  tools: [],
  observables: ['answer resolves the ambiguity', 'no missing context is invented'],
  falsifiers: ['answer guesses the referent', 'answer silently picks a material interpretation'],
  commonFailureModes: ['guessing context'],
  prohibitedActions: ['invent missing context'],
}

test('supported ambiguity procedures can enter a private certification profile by structure, not topic wording', () => {
  assert.equal(
    inferCertificationProfileForDraft(ambiguityDraft, ['unresolved_referent_followup']),
    'context_ambiguity_v1',
  )
  assert.equal(
    inferCertificationProfileForDraft(ambiguityDraft, ['deictic_predicate_question', 'underspecified_comparison']),
    'context_ambiguity_v1',
  )
})

test('unsupported or mixed trigger families fail closed instead of self-certifying', () => {
  assert.equal(inferCertificationProfileForDraft(ambiguityDraft, []), null)
  assert.equal(inferCertificationProfileForDraft(ambiguityDraft, ['unresolved_referent_followup', 'unknown_trigger']), null)
  const unrelated = { ...ambiguityDraft, title: 'Tune database indexes', description: 'Measure query plans and index selectivity before changing database indexes.', problemClass: 'database indexing performance' }
  assert.equal(inferCertificationProfileForDraft(unrelated, ['unresolved_referent_followup']), null)
})

test('curated profile review remains falsifiable and rejects one-off dated candidates', () => {
  const approved = reviewCuratedCertificationCandidate({
    skill_key: 'reasoning.context_ambiguity_resolution.v1',
    title: ambiguityDraft.title,
    description: ambiguityDraft.description,
    subject: ambiguityDraft.problemClass,
    procedure: { ...ambiguityDraft, reasoningTriggers: ['unresolved_referent_followup'] },
    metadata: { reasoningTriggers: ['unresolved_referent_followup'] },
  }, 'context_ambiguity_v1')
  assert.equal(approved.approved, true)

  const rejected = reviewCuratedCertificationCandidate({
    skill_key: 'reasoning.bad.v1',
    title: 'Resolve the 2026 example',
    description: 'Resolve context for one dated 2026 answer and repeat that literal behavior whenever it appears.',
    subject: 'ambiguity and context resolution',
    procedure: { ...ambiguityDraft, reasoningTriggers: ['unresolved_referent_followup'] },
    metadata: { reasoningTriggers: ['unresolved_referent_followup'] },
  }, 'context_ambiguity_v1')
  assert.equal(rejected.approved, false)
  assert.ok(rejected.reasons.includes('one_off_literal_or_dated_candidate'))
})

test('failed practice cannot satisfy the practiced lifecycle stage', () => {
  const base = {
    evaluatorApproved: true,
    understandingApproved: true,
    holdoutAttempts: 0,
    holdoutSuccesses: 0,
    distinctHoldoutVariants: 0,
    productionAttempts: 0,
    productionSuccesses: 0,
    failureCount: 0,
    lastValidatedAt: null,
  }
  const failed = evaluateCognitiveSkillEligibility({
    ...base,
    practiceAttempts: 2,
    practiceSuccesses: 0,
  })
  assert.equal(failed.recommendedStatus, 'understood')

  const passed = evaluateCognitiveSkillEligibility({
    ...base,
    practiceAttempts: 2,
    practiceSuccesses: 2,
  })
  assert.equal(passed.recommendedStatus, 'practiced')
})

test('validated and learned remain evidence-based milestones', () => {
  const now = new Date().toISOString()
  const validated = evaluateCognitiveSkillEligibility({
    evaluatorApproved: true,
    understandingApproved: true,
    practiceAttempts: 2,
    practiceSuccesses: 2,
    holdoutAttempts: 3,
    holdoutSuccesses: 3,
    distinctHoldoutVariants: 3,
    productionAttempts: 0,
    productionSuccesses: 0,
    failureCount: 0,
    lastValidatedAt: now,
  })
  assert.equal(validated.recommendedStatus, 'validated')

  const learned = evaluateCognitiveSkillEligibility({
    evaluatorApproved: true,
    understandingApproved: true,
    practiceAttempts: 2,
    practiceSuccesses: 2,
    holdoutAttempts: 5,
    holdoutSuccesses: 5,
    distinctHoldoutVariants: 5,
    productionAttempts: 0,
    productionSuccesses: 0,
    failureCount: 0,
    lastValidatedAt: now,
  })
  assert.equal(learned.recommendedStatus, 'learned')
})

test('certification uses protected curated evidence and never automatically calls a closed-model teacher', () => {
  const source = read('../lib/ai/cos/cognitiveCertification.ts')
  assert.match(source, /cos_cognitive_certification_cases/)
  assert.match(source, /generation_source: 'curated'/)
  assert.match(source, /independentPrivateCase: true/)
  assert.match(source, /automaticClosedModelEvaluation: false/)
  assert.doesNotMatch(source, /createExternalTeacherAiPort/)
  assert.doesNotMatch(source, /COS_COGNITIVE_EXTERNAL_EVALUATION_ENABLED/)
})

test('private certification schema contains no committed held-out prompts and stays RLS protected', () => {
  const migration = read('../supabase/migrations/20260822_cos_cognitive_autonomous_certification.sql')
  assert.match(migration, /cos_cognitive_certification_cases/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /held-out prompts are seeded directly/)
  assert.doesNotMatch(migration, /insert into public\.cos_cognitive_certification_cases/i)
})

test('existing daily mining cycle runs bounded certification without a new schedule', () => {
  const cron = read('../app/api/cron/cos-mining/route.ts')
  assert.match(cron, /runCognitiveCertificationCycle/)
  assert.match(cron, /certification = await runCognitiveCertificationCycle\(\)/)
  assert.match(cron, /certification,/)
})
