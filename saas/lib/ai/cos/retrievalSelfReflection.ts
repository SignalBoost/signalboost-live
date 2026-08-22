// saas/lib/ai/cos/retrievalSelfReflection.ts
//
// Deterministic retrieval self-reflection over explicit retrieval artifacts only.
// This module never receives or stores raw prompts, answers, or hidden reasoning.

export const RETRIEVAL_REFLECTION_VERSION = 'retrieval_reflection_v1' as const
export const RETRIEVAL_REFLECTION_MIN_VERIFIED_OUTCOMES = 12
export const RETRIEVAL_REFLECTION_MIN_LABEL_OUTCOMES = 3
export const RETRIEVAL_REFLECTION_MIN_ACCURACY = 0.70
export const RETRIEVAL_REFLECTION_MAX_BRIER = 0.22
export const RETRIEVAL_REFLECTION_MIN_RISK_SEPARATION = 0.15

export type RetrievalReflectionSufficiency = 'weak' | 'mixed' | 'adequate' | 'over_supplied'
export type RetrievalMissingEvidenceClass = 'none' | 'retrieval_quality' | 'source_diversity' | 'grounding_use' | 'unknown'
export type RetrievalRecommendation = 'no_change' | 'reduce_context' | 'raise_similarity_floor' | 'diversify_sources' | 'inspect_grounding'

export type RetrievalReflectionItem = {
  sourceKind?: string | null
  similarity?: number | null
  cited?: boolean | null
}

export type RetrievalReflectionInput = {
  injected: number
  cited: number
  items?: RetrievalReflectionItem[]
}

export type RetrievalSelfReflection = {
  version: typeof RETRIEVAL_REFLECTION_VERSION
  sufficiency: RetrievalReflectionSufficiency
  missingEvidenceClass: RetrievalMissingEvidenceClass
  recommendation: RetrievalRecommendation
  predictedFailureRisk: number
  signals: {
    injected: number
    cited: number
    unused: number
    unusedRate: number
    distinctSourceKinds: number
    avgSimilarity: number | null
    citedAvgSimilarity: number | null
    unusedAvgSimilarity: number | null
    similaritySeparation: number | null
  }
}

export type RetrievalReflectionOutcome = {
  predictedFailureRisk: number
  verifiedSuccess: boolean
}

export type RetrievalReflectionPredictiveRow = RetrievalReflectionOutcome & {
  turnId: string
}

export type RetrievalReflectionPredictiveAssessment = {
  verifiedOutcomes: number
  verifiedSuccesses: number
  verifiedFailures: number
  accuracy: number | null
  brierScore: number | null
  avgRiskOnSuccess: number | null
  avgRiskOnFailure: number | null
  riskSeparation: number | null
  shadowValidationEligible: boolean
  reasons: string[]
}

function boundedRate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : null
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))
}

function rounded(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4))
}

function normalizedItems(items: readonly RetrievalReflectionItem[]): Array<{ sourceKind: string; similarity: number | null; cited: boolean }> {
  return items.map(item => ({
    sourceKind: String(item?.sourceKind || 'unknown').trim().toLowerCase() || 'unknown',
    similarity: boundedRate(item?.similarity),
    cited: item?.cited === true,
  }))
}

/**
 * Produce a bounded hypothesis about retrieval quality from observable retrieval artifacts.
 * The recommendation is a hypothesis only. It cannot change live policy until separately validated.
 */
export function deriveRetrievalSelfReflection(input: RetrievalReflectionInput): RetrievalSelfReflection {
  const injected = Math.max(0, Math.floor(Number(input?.injected) || 0))
  const cited = Math.max(0, Math.min(injected, Math.floor(Number(input?.cited) || 0)))
  const unused = Math.max(0, injected - cited)
  const unusedRate = injected > 0 ? rounded(unused / injected) : 1
  const items = normalizedItems(Array.isArray(input?.items) ? input.items : [])
  const similarities = items.map(item => item.similarity).filter((value): value is number => value !== null)
  const citedSimilarities = items.filter(item => item.cited).map(item => item.similarity).filter((value): value is number => value !== null)
  const unusedSimilarities = items.filter(item => !item.cited).map(item => item.similarity).filter((value): value is number => value !== null)
  const avgSimilarity = mean(similarities)
  const citedAvgSimilarity = mean(citedSimilarities)
  const unusedAvgSimilarity = mean(unusedSimilarities)
  const similaritySeparation = citedAvgSimilarity !== null && unusedAvgSimilarity !== null
    ? Number((citedAvgSimilarity - unusedAvgSimilarity).toFixed(4))
    : null
  const distinctSourceKinds = new Set(items.map(item => item.sourceKind).filter(Boolean)).size

  let sufficiency: RetrievalReflectionSufficiency = 'mixed'
  let missingEvidenceClass: RetrievalMissingEvidenceClass = 'unknown'
  let recommendation: RetrievalRecommendation = 'inspect_grounding'
  let predictedFailureRisk = 0.45

  if (cited === 0) {
    sufficiency = 'weak'
    predictedFailureRisk = avgSimilarity !== null && avgSimilarity < 0.70 ? 0.78 : 0.68
    if (distinctSourceKinds <= 1 && injected >= 3) {
      missingEvidenceClass = 'source_diversity'
      recommendation = 'diversify_sources'
    } else if (avgSimilarity !== null && avgSimilarity < 0.70) {
      missingEvidenceClass = 'retrieval_quality'
      recommendation = 'raise_similarity_floor'
    } else {
      missingEvidenceClass = 'grounding_use'
      recommendation = 'inspect_grounding'
    }
  } else if (injected >= 4 && unusedRate >= 0.75) {
    sufficiency = 'over_supplied'
    missingEvidenceClass = 'none'
    predictedFailureRisk = citedAvgSimilarity !== null && citedAvgSimilarity >= 0.78 ? 0.22 : 0.34
    recommendation = similaritySeparation !== null && similaritySeparation >= 0.05
      ? 'raise_similarity_floor'
      : 'reduce_context'
  } else if (distinctSourceKinds <= 1 && injected >= 4 && cited < 2) {
    sufficiency = 'mixed'
    missingEvidenceClass = 'source_diversity'
    recommendation = 'diversify_sources'
    predictedFailureRisk = 0.52
  } else if (cited >= 2 || (cited >= 1 && unusedRate <= 0.50)) {
    sufficiency = 'adequate'
    missingEvidenceClass = 'none'
    recommendation = 'no_change'
    predictedFailureRisk = citedAvgSimilarity !== null && citedAvgSimilarity >= 0.78 ? 0.16 : 0.25
  }

  return {
    version: RETRIEVAL_REFLECTION_VERSION,
    sufficiency,
    missingEvidenceClass,
    recommendation,
    predictedFailureRisk: rounded(predictedFailureRisk),
    signals: {
      injected,
      cited,
      unused,
      unusedRate,
      distinctSourceKinds,
      avgSimilarity,
      citedAvgSimilarity,
      unusedAvgSimilarity,
      similaritySeparation,
    },
  }
}

export function retrievalPredictionCorrect(outcome: RetrievalReflectionOutcome): boolean {
  const predictedFailure = Math.max(0, Math.min(1, Number(outcome.predictedFailureRisk) || 0)) >= 0.5
  return predictedFailure === !outcome.verifiedSuccess
}

export function retrievalPredictionBrier(outcome: RetrievalReflectionOutcome): number {
  const risk = Math.max(0, Math.min(1, Number(outcome.predictedFailureRisk) || 0))
  const observedFailure = outcome.verifiedSuccess ? 0 : 1
  return Number(((risk - observedFailure) ** 2).toFixed(6))
}

/**
 * Assess whether deterministic reflections predict later verified outcomes well enough to justify
 * a separately controlled shadow-policy experiment. This never promotes or changes live retrieval.
 */
export function assessRetrievalReflectionPredictiveValue(rows: readonly RetrievalReflectionPredictiveRow[]): RetrievalReflectionPredictiveAssessment {
  const unique = new Map<string, RetrievalReflectionPredictiveRow>()
  for (const row of rows) if (row?.turnId) unique.set(row.turnId, row)
  const values = [...unique.values()]
  const successes = values.filter(row => row.verifiedSuccess)
  const failures = values.filter(row => !row.verifiedSuccess)
  const accuracy = values.length ? mean(values.map(row => retrievalPredictionCorrect(row) ? 1 : 0)) : null
  const brierScore = values.length ? mean(values.map(retrievalPredictionBrier)) : null
  const avgRiskOnSuccess = mean(successes.map(row => Math.max(0, Math.min(1, row.predictedFailureRisk))))
  const avgRiskOnFailure = mean(failures.map(row => Math.max(0, Math.min(1, row.predictedFailureRisk))))
  const riskSeparation = avgRiskOnSuccess !== null && avgRiskOnFailure !== null
    ? Number((avgRiskOnFailure - avgRiskOnSuccess).toFixed(4))
    : null
  const reasons: string[] = []

  if (values.length < RETRIEVAL_REFLECTION_MIN_VERIFIED_OUTCOMES) reasons.push(`Need at least ${RETRIEVAL_REFLECTION_MIN_VERIFIED_OUTCOMES} distinct verified outcomes.`)
  if (successes.length < RETRIEVAL_REFLECTION_MIN_LABEL_OUTCOMES || failures.length < RETRIEVAL_REFLECTION_MIN_LABEL_OUTCOMES) reasons.push(`Need at least ${RETRIEVAL_REFLECTION_MIN_LABEL_OUTCOMES} verified successes and failures.`)
  if (accuracy === null || accuracy < RETRIEVAL_REFLECTION_MIN_ACCURACY) reasons.push(`Prediction accuracy must reach ${(RETRIEVAL_REFLECTION_MIN_ACCURACY * 100).toFixed(0)}%.`)
  if (brierScore === null || brierScore > RETRIEVAL_REFLECTION_MAX_BRIER) reasons.push(`Brier score must be <= ${RETRIEVAL_REFLECTION_MAX_BRIER.toFixed(2)}.`)
  if (riskSeparation === null || riskSeparation < RETRIEVAL_REFLECTION_MIN_RISK_SEPARATION) reasons.push(`Failure-risk separation must be >= ${RETRIEVAL_REFLECTION_MIN_RISK_SEPARATION.toFixed(2)}.`)

  return {
    verifiedOutcomes: values.length,
    verifiedSuccesses: successes.length,
    verifiedFailures: failures.length,
    accuracy,
    brierScore,
    avgRiskOnSuccess,
    avgRiskOnFailure,
    riskSeparation,
    shadowValidationEligible: reasons.length === 0,
    reasons: reasons.length ? reasons : ['Reflection predictions cleared the evidence gate for a separate shadow-policy validation; live retrieval remains unchanged.'],
  }
}
