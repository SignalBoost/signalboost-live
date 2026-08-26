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

const performanceDraft = {
  title: 'Analyze divergent latency percentiles after maintenance',
  description: 'Diagnose performance regressions where median and tail latency move in different directions by ranking mechanisms that explain the entire distribution and testing them with read-only telemetry.',
  problemClass: 'performance regression analysis across divergent latency percentiles',
  prerequisites: ['latency percentile history', 'event timeline'],
  procedureSteps: [
    'Correlate the regression window with maintenance or other system events.',
    'Rank mechanisms that can explain both the median and tail-latency movement instead of explaining only one percentile.',
    'Use read-only observability to distinguish the mechanisms and state a falsifier for the leading hypothesis.',
  ],
  discriminatingSignals: ['p50 and p99 move in opposite directions', 'aggregate load stays broadly stable'],
  tools: ['latency histograms', 'lock wait metrics', 'query plan inspection'],
  observables: ['histogram shape across the event window', 'lock waits and execution-plan changes'],
  falsifiers: ['unchanged waits rule out contention', 'unchanged plans and execution spans rule out a plan-regime explanation'],
  commonFailureModes: ['explaining only p50 or only p99', 'blaming the latest event without discriminating evidence'],
  prohibitedActions: ['mutate production merely to test a hypothesis'],
}

const architectureDraft = {
  title: 'Discover system architecture from verifiable implementation evidence',
  description: 'Map architectural components and relationships from entry points, request flow, permissions, configuration and observable artifacts without inventing undocumented components.',
  problemClass: 'system architecture discovery and component relationship verification',
  prerequisites: ['repository or deployment artifacts', 'ability to inspect request flow'],
  procedureSteps: [
    'Identify entry points such as routes, endpoints or gateways.',
    'Trace request and data flow to distinguish transport, reasoning, execution and fallback responsibilities.',
    'Verify inferred relationships using permission boundaries, read-only restrictions, code paths and configuration artifacts.',
  ],
  discriminatingSignals: ['distinct route or gateway entry points', 'different execution permissions or tool access'],
  tools: ['code search', 'configuration inspection', 'request-flow tracing'],
  observables: ['file paths tied to architectural roles', 'configuration flags or permission checks that constrain execution'],
  falsifiers: ['the alleged component boundary has no distinct code or configuration evidence', 'observed request flow contradicts the proposed relationship'],
  commonFailureModes: ['assuming a standard architecture without checking the implementation', 'confusing transport with reasoning or execution'],
  prohibitedActions: ['invent component names or relationships', 'ignore mutation and permission boundaries'],
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

test('supported performance and architecture procedures get separate private certification families', () => {
  assert.equal(inferCertificationProfileForDraft(performanceDraft, []), 'performance_regression_diagnosis_v1')
  assert.equal(inferCertificationProfileForDraft(architectureDraft, []), 'architecture_discovery_v1')

  const performanceReview = reviewCuratedCertificationCandidate({
    title: performanceDraft.title,
    description: performanceDraft.description,
    subject: performanceDraft.problemClass,
    procedure: performanceDraft,
    metadata: {},
  }, 'performance_regression_diagnosis_v1')
  assert.equal(performanceReview.approved, true)

  const architectureReview = reviewCuratedCertificationCandidate({
    title: architectureDraft.title,
    description: architectureDraft.description,
    subject: architectureDraft.problemClass,
    procedure: architectureDraft,
    metadata: {},
  }, 'architecture_discovery_v1')
  assert.equal(architectureReview.approved, true)
})

test('mutable current-fact verification remains outside autonomous cognitive certification', () => {
  const currentFactDraft = {
    title: 'Verify current officeholder from authoritative sources',
    description: 'Identify the current holder of a public office by checking live government and election sources against the effective date.',
    problemClass: 'factual verification and temporal entity resolution',
    prerequisites: ['current date', 'jurisdiction'],
    procedureSteps: ['identify the office', 'query live primary sources', 'cross-check the effective date'],
    discriminatingSignals: ['recent election', 'inauguration or succession date'],
    tools: ['official government websites'],
    observables: ['current official directory', 'dated swearing-in announcement'],
    falsifiers: ['the source predates a succession event', 'the named person is not yet sworn in'],
    commonFailureModes: ['using cached incumbent data'],
    prohibitedActions: ['assume the previous officeholder is still current'],
  }
  assert.equal(inferCertificationProfileForDraft(currentFactDraft, []), null)
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
  assert.equal(inferCertificationProfileForDraft(unrelated, []), null)
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
  const activeLearningCall = cron.indexOf('cognitive = await runGovernedCognitiveLearningCycle')
  assert.ok(certificationCall > 0, 'certification call must exist')
  assert.ok(dailyLearningCall > certificationCall, 'certification must run before daily autonomous learning consumes route budget')
  assert.ok(activeLearningCall > certificationCall, 'certification must run before cognitive active learning consumes route budget')
})

test('generic active learning cannot spend practice calls on no-path or private-certification work', () => {
  const cron = read('../app/api/cron/cos-mining/route.ts')
  const orchestrator = read('../lib/ai/cos/cognitiveLearningOrchestrator.ts')
  assert.match(cron, /runGovernedCognitiveLearningCycle/)
  assert.doesNotMatch(cron, /runCognitiveLearningCycle/)
  assert.match(orchestrator, /generation_source', 'local_generator'/)
  assert.match(orchestrator, /status: 'discarded'/)
  assert.match(orchestrator, /no_independent_promotion_path/)
  assert.match(orchestrator, /private_certification_uses_curated_practice/)
  assert.match(orchestrator, /awaiting_independent_evaluation/)
  assert.match(orchestrator, /private_certification_queue_owned_by_certification_cycle/)
  assert.match(orchestrator, /no_external_evaluator_and_private_practice_is_certification_owned/)

  const lessonCall = orchestrator.indexOf('evaluateNextTeacherLesson()')
  const cleanupAfterLesson = orchestrator.indexOf('discardUnnecessaryLocalCognitivePractice()', lessonCall)
  const practiceCall = orchestrator.indexOf('runNextCognitivePractice()', cleanupAfterLesson)
  assert.ok(lessonCall > 0)
  assert.ok(cleanupAfterLesson > lessonCall, 'new local practice must be cleaned before any generic practice execution')
  assert.ok(practiceCall > cleanupAfterLesson, 'generic practice call must remain behind the promotion-path cleanup')
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
