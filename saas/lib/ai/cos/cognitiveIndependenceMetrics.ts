export type CosIndependenceExperienceRow = {
  experience_kind?: string | null
  subject?: string | null
  source_kind?: string | null
  success?: boolean | null
  occurrence_count?: number | null
  evidence?: Record<string, unknown> | null
}

export type CosVerifiedOutcomeMetricBucket = {
  outcomes: number
  successes: number
  failures: number
  observed: number
}

export type CosIndependenceMetrics = {
  schemaVersion: 3
  semantics: 'observed_runtime_learning_metrics_not_heldout_certification'
  targetIndependentPassRate: number
  observedTurnAttempts: number
  independentAcceptedTurns: number
  independentAcceptanceRate: number | null
  localAcceptedTurns: number
  cacheReuseTurns: number
  freshVerifiedTurns: number
  otherAcceptedTurns: number
  externalRequiredTurns: number
  teacherInteractions: number
  teacherDependencyRate: number | null
  skillGroundedAcceptedTurns: number
  factualGroundedAcceptedTurns: number
  positiveFeedback: number
  negativeFeedback: number
  userCorrections: number
  feedbackSignals: number
  verifiedProductionOutcomes: number
  verifiedProductionSuccesses: number
  verifiedProductionFailures: number
  verifiedProductionObserved: number
  verifiedProductionSuccessRate: number | null
  outcomeDomains: Record<string, CosVerifiedOutcomeMetricBucket>
  subjects: Record<string, {
    attempts: number
    independentAccepted: number
    externalRequired: number
    teacherInteractions: number
    positiveFeedback: number
    negativeFeedback: number
    userCorrections: number
    productionOutcomes: number
    productionSuccesses: number
    productionFailures: number
    productionObserved: number
  }>
}

function boundedCount(value: unknown): number {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function nestedCount(value: unknown, key: string): number {
  return boundedCount(object(value)[key])
}

function subjectKey(value: unknown): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 180)
  return text || 'general reasoning'
}

function routeClass(row: CosIndependenceExperienceRow): string {
  return String(object(row.evidence).routeClass ?? '').trim().toLowerCase()
}

function accepted(row: CosIndependenceExperienceRow): boolean {
  const evidence = object(row.evidence)
  if (typeof evidence.acceptedByCosGate === 'boolean') return evidence.acceptedByCosGate
  return row.success === true
}

function outcomeStatus(row: CosIndependenceExperienceRow): 'success' | 'failure' | 'observed' {
  const status = String(object(row.evidence).outcomeStatus ?? '').trim().toLowerCase()
  if (status === 'success' || status === 'failure' || status === 'observed') return status
  if (row.success === true) return 'success'
  if (row.success === false) return 'failure'
  return 'observed'
}

function newOutcomeBucket(): CosVerifiedOutcomeMetricBucket {
  return { outcomes: 0, successes: 0, failures: 0, observed: 0 }
}

/**
 * Compute operational independence trends from durable episodic evidence.
 *
 * These metrics show whether normal COS runtime work is increasingly completed without an external
 * model teacher. They are intentionally NOT the ~85% held-out certification metric: production
 * traffic is not a hidden test set, cache reuse is not new reasoning competence, and live data
 * retrieval is a data dependency rather than an external-AI reasoning dependency.
 *
 * Explicit user feedback is reported as a separate quality signal. Verified objective production
 * outcomes are also separate: they measure whether real-world work succeeded after execution, not
 * whether the answer path was independently completed. Neither signal rewrites independence math.
 */
export function computeCosIndependenceMetrics(
  rows: CosIndependenceExperienceRow[],
  targetIndependentPassRate = 0.85,
): CosIndependenceMetrics {
  const metrics: CosIndependenceMetrics = {
    schemaVersion: 3,
    semantics: 'observed_runtime_learning_metrics_not_heldout_certification',
    targetIndependentPassRate: Math.max(0, Math.min(1, Number(targetIndependentPassRate) || 0.85)),
    observedTurnAttempts: 0,
    independentAcceptedTurns: 0,
    independentAcceptanceRate: null,
    localAcceptedTurns: 0,
    cacheReuseTurns: 0,
    freshVerifiedTurns: 0,
    otherAcceptedTurns: 0,
    externalRequiredTurns: 0,
    teacherInteractions: 0,
    teacherDependencyRate: null,
    skillGroundedAcceptedTurns: 0,
    factualGroundedAcceptedTurns: 0,
    positiveFeedback: 0,
    negativeFeedback: 0,
    userCorrections: 0,
    feedbackSignals: 0,
    verifiedProductionOutcomes: 0,
    verifiedProductionSuccesses: 0,
    verifiedProductionFailures: 0,
    verifiedProductionObserved: 0,
    verifiedProductionSuccessRate: null,
    outcomeDomains: {},
    subjects: {},
  }

  for (const row of rows) {
    const occurrences = Math.max(1, boundedCount(row.occurrence_count) || 1)
    const subject = subjectKey(row.subject)
    const bucket = metrics.subjects[subject] ?? {
      attempts: 0,
      independentAccepted: 0,
      externalRequired: 0,
      teacherInteractions: 0,
      positiveFeedback: 0,
      negativeFeedback: 0,
      userCorrections: 0,
      productionOutcomes: 0,
      productionSuccesses: 0,
      productionFailures: 0,
      productionObserved: 0,
    }
    metrics.subjects[subject] = bucket

    const kind = String(row.experience_kind ?? '').trim().toLowerCase()
    const source = String(row.source_kind ?? '').trim().toLowerCase()
    if (kind === 'teacher' || source === 'external_teacher') {
      metrics.teacherInteractions += occurrences
      bucket.teacherInteractions += occurrences
      continue
    }
    if (kind === 'feedback' || source === 'user_feedback') {
      const feedbackType = String(object(row.evidence).feedbackType ?? '').trim().toLowerCase()
      metrics.feedbackSignals += occurrences
      if (feedbackType === 'positive') {
        metrics.positiveFeedback += occurrences
        bucket.positiveFeedback += occurrences
      } else if (feedbackType === 'negative') {
        metrics.negativeFeedback += occurrences
        bucket.negativeFeedback += occurrences
      } else if (feedbackType === 'correction') {
        metrics.userCorrections += occurrences
        bucket.userCorrections += occurrences
      }
      continue
    }
    if (kind === 'production_use' && source === 'verified_objective_outcome') {
      const status = outcomeStatus(row)
      const domain = String(object(row.evidence).domain ?? 'other').replace(/\s+/g, ' ').trim().slice(0, 80) || 'other'
      const domainBucket = metrics.outcomeDomains[domain] ?? newOutcomeBucket()
      metrics.outcomeDomains[domain] = domainBucket

      metrics.verifiedProductionOutcomes += occurrences
      bucket.productionOutcomes += occurrences
      domainBucket.outcomes += occurrences
      if (status === 'success') {
        metrics.verifiedProductionSuccesses += occurrences
        bucket.productionSuccesses += occurrences
        domainBucket.successes += occurrences
      } else if (status === 'failure') {
        metrics.verifiedProductionFailures += occurrences
        bucket.productionFailures += occurrences
        domainBucket.failures += occurrences
      } else {
        metrics.verifiedProductionObserved += occurrences
        bucket.productionObserved += occurrences
        domainBucket.observed += occurrences
      }
      continue
    }
    if (kind !== 'encounter') continue

    metrics.observedTurnAttempts += occurrences
    bucket.attempts += occurrences
    const route = routeClass(row)
    const isAccepted = accepted(row)
    if (!isAccepted) {
      if (route === 'external_required') {
        metrics.externalRequiredTurns += occurrences
        bucket.externalRequired += occurrences
      }
      continue
    }

    const evidence = object(row.evidence)
    // The encounter recorder only represents COS-side execution. If future callers explicitly mark
    // an external model as invoked in an encounter, do not count that turn as independent.
    if (evidence.externalAiInvoked === true) continue

    metrics.independentAcceptedTurns += occurrences
    bucket.independentAccepted += occurrences
    if (route === 'local') metrics.localAcceptedTurns += occurrences
    else if (route === 'cache') metrics.cacheReuseTurns += occurrences
    else if (route === 'fresh') metrics.freshVerifiedTurns += occurrences
    else metrics.otherAcceptedTurns += occurrences

    const cited = object(evidence.cited)
    if (nestedCount(cited, 'cognitiveSkills') > 0) metrics.skillGroundedAcceptedTurns += occurrences
    if (
      nestedCount(cited, 'knowledgeGraph') > 0 ||
      nestedCount(cited, 'learnedCorpus') > 0 ||
      nestedCount(cited, 'enterpriseMemory') > 0
    ) metrics.factualGroundedAcceptedTurns += occurrences
  }

  if (metrics.observedTurnAttempts > 0) {
    metrics.independentAcceptanceRate = metrics.independentAcceptedTurns / metrics.observedTurnAttempts
  }
  const teacherDecisionPopulation = metrics.independentAcceptedTurns + metrics.teacherInteractions
  if (teacherDecisionPopulation > 0) {
    metrics.teacherDependencyRate = metrics.teacherInteractions / teacherDecisionPopulation
  }
  const terminalProductionOutcomes = metrics.verifiedProductionSuccesses + metrics.verifiedProductionFailures
  if (terminalProductionOutcomes > 0) {
    metrics.verifiedProductionSuccessRate = metrics.verifiedProductionSuccesses / terminalProductionOutcomes
  }
  return metrics
}
