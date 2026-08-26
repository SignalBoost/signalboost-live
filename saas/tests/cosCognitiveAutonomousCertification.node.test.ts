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
  const unrelated = {
    title: 'Tune database indexes safely',
    description: 'Measure query plans, selectivity and write amplification before changing a database index.',
    problemClass: 'database indexing performance',
    prerequisites: [],
    procedureSteps: [
      'Capture representative query plans and timings.',
      'Measure selectivity and write amplification for candidate indexes.',
      'Validate the index change against a representative workload before rollout.',
    ],
    discriminatingSignals: ['query plan regression', 'index selectivity'],
    tools: [],
    observables: ['query latency changes are measured', 'write overhead is measured'],
    falsifiers: ['no representative plan evidence exists', 'the candidate increases cost without latency benefit'],
    commonFailureModes: ['optimizing one query while harming writes'],
    prohibitedActions: ['deploy an unmeasured index change'],
  }
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

test('daily certification shares the route deadline, runs before long learning work, and launches at most one model exercise', () => {
  const cron = read('../app/api/cron/cos-mining/route.ts')
  const source = read('../lib/ai/cos/cognitiveCertification.ts')
  assert.match(cron, /const routeStartedAt = Date\.now\(\)/)
  assert.match(cron, /CERTIFICATION_ROUTE_DEADLINE_MS = 210_000/)
  assert.match(cron, /deadlineAt: routeStartedAt \+ CERTIFICATION_ROUTE_DEADLINE_MS/)
  assert.match(cron, /maxModelCalls: 1/)
  assert.match(source, /DEFAULT_MAX_MODEL_CALLS = 1/)
  assert.match(source, /canStartCertificationModelCall/)
  assert.match(source, /progressive_cycle_call_budget_reached/)

  const certificationCall = cron.indexOf('certification = await runCognitiveCertificationCycle')
  const dailyLearningCall = cron.indexOf('learning = await runDailyAutonomousLearning')
  const activeLearningCall = cron.indexOf('cognitive = await runCognitiveLearningCycle')
  assert.ok(certificationCall > 0, 'certification call must exist')
  assert.ok(dailyLearningCall > certificationCall, 'certification must run before daily autonomous learning consumes route budget')
  assert.ok(activeLearningCall > certificationCall, 'certification must run before cognitive active learning consumes route budget')
})

test('certification rotates candidates, recovers interrupted work, and stops exhausted validated skills from starving the queue', () => {
  const source = read('../lib/ai/cos/cognitiveCertification.ts')
  assert.match(source, /last_cycle_at: now/)
  assert.match(source, /updated_at: now/)
  assert.match(source, /stale_running_recovered/)
  assert.match(source, /STALE_RUNNING_AFTER_MS/)
  assert.match(source, /certification\.saturated === true/)
  assert.match(source, /private_holdouts_exhausted_without_learned_threshold/)
})

test('daily mining records cognitive skill pipeline health without persisting request text', () => {
  const cron = read('../app/api/cron/cos-mining/route.ts')
  const health = read('../lib/ai/cos/cognitiveSkillPipelineHealth.ts')
  assert.match(cron, /recordCognitiveSkillPipelineHealth/)
  assert.match(cron, /cognitiveSkillHealth/)
  assert.match(health, /queuedPracticeWithoutPromotionPath/)
  assert.match(health, /awaitingIndependentEvaluation/)
  assert.match(health, /privateCertificationPending/)
  assert.match(health, /cos-cognitive-skill-pipeline-health-v1/)
  assert.doesNotMatch(health, /prompt_hash|prompt\s*:/i)
  assert.doesNotMatch(health, /\.select\([^)]*prompt/i)
})
