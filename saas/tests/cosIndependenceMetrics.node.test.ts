import assert from 'node:assert/strict'
import test from 'node:test'
import { computeCosIndependenceMetrics } from '../lib/ai/cos/cognitiveIndependenceMetrics.ts'

test('independence metrics distinguish local generation, cache reuse, fresh verification, and teacher dependency', () => {
  const metrics = computeCosIndependenceMetrics([
    {
      experience_kind: 'encounter', subject: 'Kubernetes', source_kind: 'cos_local_reasoning', success: true, occurrence_count: 2,
      evidence: { routeClass: 'local', acceptedByCosGate: true, externalAiInvoked: false, cited: { cognitiveSkills: 1, knowledgeGraph: 1 } },
    },
    {
      experience_kind: 'encounter', subject: 'Kubernetes', source_kind: 'cos_answer_reuse', success: true, occurrence_count: 3,
      evidence: { routeClass: 'cache', acceptedByCosGate: true, externalAiInvoked: false, cited: {} },
    },
    {
      experience_kind: 'encounter', subject: 'public officeholder', source_kind: 'cos_live_verification', success: true, occurrence_count: 1,
      evidence: { routeClass: 'fresh', acceptedByCosGate: true, externalAiInvoked: false, cited: {} },
    },
    {
      experience_kind: 'encounter', subject: 'novel diagnosis', source_kind: 'cos_local_escalation', success: false, occurrence_count: 1,
      evidence: { routeClass: 'external_required', acceptedByCosGate: false, externalAiInvoked: false },
    },
    {
      experience_kind: 'teacher', subject: 'novel diagnosis', source_kind: 'external_teacher', success: null, occurrence_count: 1,
      evidence: { teacherProvider: 'gemini' },
    },
  ])

  assert.equal(metrics.schemaVersion, 3)
  assert.equal(metrics.observedTurnAttempts, 7)
  assert.equal(metrics.independentAcceptedTurns, 6)
  assert.equal(metrics.localAcceptedTurns, 2)
  assert.equal(metrics.cacheReuseTurns, 3)
  assert.equal(metrics.freshVerifiedTurns, 1)
  assert.equal(metrics.externalRequiredTurns, 1)
  assert.equal(metrics.teacherInteractions, 1)
  assert.equal(metrics.skillGroundedAcceptedTurns, 2)
  assert.equal(metrics.factualGroundedAcceptedTurns, 2)
  assert.equal(metrics.independentAcceptanceRate, 6 / 7)
  assert.equal(metrics.teacherDependencyRate, 1 / 7)
  assert.deepEqual(metrics.subjects.Kubernetes, {
    attempts: 5,
    independentAccepted: 5,
    externalRequired: 0,
    teacherInteractions: 0,
    positiveFeedback: 0,
    negativeFeedback: 0,
    userCorrections: 0,
    productionOutcomes: 0,
    productionSuccesses: 0,
    productionFailures: 0,
    productionObserved: 0,
  })
})

test('cache reuse contributes operational independence but remains separately visible from reasoning competence', () => {
  const metrics = computeCosIndependenceMetrics([
    {
      experience_kind: 'encounter', source_kind: 'cos_answer_reuse', success: true, occurrence_count: 10,
      evidence: { routeClass: 'cache', acceptedByCosGate: true, externalAiInvoked: false },
    },
  ])

  assert.equal(metrics.independentAcceptedTurns, 10)
  assert.equal(metrics.cacheReuseTurns, 10)
  assert.equal(metrics.localAcceptedTurns, 0)
  assert.equal(metrics.semantics, 'observed_runtime_learning_metrics_not_heldout_certification')
  assert.equal(metrics.targetIndependentPassRate, 0.85)
})

test('an encounter explicitly marked external AI is never counted as independent', () => {
  const metrics = computeCosIndependenceMetrics([
    {
      experience_kind: 'encounter', source_kind: 'legacy_external', success: true, occurrence_count: 1,
      evidence: { routeClass: 'other', acceptedByCosGate: true, externalAiInvoked: true },
    },
  ])

  assert.equal(metrics.observedTurnAttempts, 1)
  assert.equal(metrics.independentAcceptedTurns, 0)
  assert.equal(metrics.independentAcceptanceRate, 0)
})

test('teacher rows do not masquerade as turn attempts', () => {
  const metrics = computeCosIndependenceMetrics([
    { experience_kind: 'teacher', source_kind: 'external_teacher', occurrence_count: 4, evidence: {} },
  ])

  assert.equal(metrics.observedTurnAttempts, 0)
  assert.equal(metrics.teacherInteractions, 4)
  assert.equal(metrics.teacherDependencyRate, 1)
  assert.equal(metrics.independentAcceptanceRate, null)
})

test('explicit feedback is a quality signal and never changes independence math', () => {
  const metrics = computeCosIndependenceMetrics([
    {
      experience_kind: 'encounter', subject: 'Kubernetes', success: true, occurrence_count: 2,
      evidence: { routeClass: 'local', acceptedByCosGate: true, externalAiInvoked: false },
    },
    {
      experience_kind: 'feedback', subject: 'Kubernetes', source_kind: 'user_feedback', occurrence_count: 3,
      evidence: { feedbackType: 'positive', semantics: 'user_feedback_signal_not_verified_truth' },
    },
    {
      experience_kind: 'feedback', subject: 'Kubernetes', source_kind: 'user_feedback', occurrence_count: 2,
      evidence: { feedbackType: 'negative', semantics: 'user_feedback_signal_not_verified_truth' },
    },
    {
      experience_kind: 'feedback', subject: 'Kubernetes', source_kind: 'user_feedback', occurrence_count: 1,
      evidence: { feedbackType: 'correction', semantics: 'user_feedback_signal_not_verified_truth' },
    },
  ])

  assert.equal(metrics.observedTurnAttempts, 2)
  assert.equal(metrics.independentAcceptedTurns, 2)
  assert.equal(metrics.independentAcceptanceRate, 1)
  assert.equal(metrics.feedbackSignals, 6)
  assert.equal(metrics.positiveFeedback, 3)
  assert.equal(metrics.negativeFeedback, 2)
  assert.equal(metrics.userCorrections, 1)
  assert.deepEqual(metrics.subjects.Kubernetes, {
    attempts: 2,
    independentAccepted: 2,
    externalRequired: 0,
    teacherInteractions: 0,
    positiveFeedback: 3,
    negativeFeedback: 2,
    userCorrections: 1,
    productionOutcomes: 0,
    productionSuccesses: 0,
    productionFailures: 0,
    productionObserved: 0,
  })
})

test('verified production outcomes report real-world success separately from answer independence', () => {
  const metrics = computeCosIndependenceMetrics([
    {
      experience_kind: 'encounter', subject: 'incident diagnosis', source_kind: 'cos_local_reasoning', success: true,
      evidence: { routeClass: 'local', acceptedByCosGate: true, externalAiInvoked: false },
    },
    {
      experience_kind: 'production_use', subject: 'incident diagnosis', source_kind: 'verified_objective_outcome', success: true,
      evidence: { outcomeStatus: 'success', domain: 'self_healing', semantics: 'verified_production_outcome_signal_not_factual_promotion' },
    },
    {
      experience_kind: 'production_use', subject: 'incident diagnosis', source_kind: 'verified_objective_outcome', success: false,
      evidence: { outcomeStatus: 'failure', domain: 'self_healing', semantics: 'verified_production_outcome_signal_not_factual_promotion' },
    },
    {
      experience_kind: 'production_use', subject: 'incident diagnosis', source_kind: 'verified_objective_outcome', success: null,
      evidence: { outcomeStatus: 'observed', domain: 'self_healing', semantics: 'verified_production_outcome_signal_not_factual_promotion' },
    },
    {
      experience_kind: 'production_use', subject: 'incident diagnosis', source_kind: 'verified_production_outcome', success: true,
      evidence: { evidence: { source: 'council_objective_prediction' } },
    },
  ])

  assert.equal(metrics.observedTurnAttempts, 1)
  assert.equal(metrics.independentAcceptedTurns, 1)
  assert.equal(metrics.verifiedProductionOutcomes, 3)
  assert.equal(metrics.verifiedProductionSuccesses, 1)
  assert.equal(metrics.verifiedProductionFailures, 1)
  assert.equal(metrics.verifiedProductionObserved, 1)
  assert.equal(metrics.verifiedProductionSuccessRate, 0.5)
  assert.deepEqual(metrics.outcomeDomains.self_healing, {
    outcomes: 3,
    successes: 1,
    failures: 1,
    observed: 1,
  })
  assert.equal(metrics.subjects['incident diagnosis'].productionOutcomes, 3)
})
