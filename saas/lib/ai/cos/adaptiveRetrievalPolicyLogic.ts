export const ADAPTIVE_RETRIEVAL_MIN_TRAINING_CASES = 6
export const ADAPTIVE_RETRIEVAL_MIN_INJECTED_ITEMS = 36
export const ADAPTIVE_RETRIEVAL_MIN_SUCCESS_RATE = 0.80
export const ADAPTIVE_RETRIEVAL_MIN_UNUSED_RATE = 0.85
export const ADAPTIVE_RETRIEVAL_REQUIRED_VALIDATIONS = 2
export const LIVE_LEARNED_CORPUS_MAX_INJECTED = 6

export type AdaptiveRetrievalTrainingRow = {
  turnId: string
  injected: number
  cited: number
  items?: Array<{ similarity?: number | null; cited?: boolean }>
  verifiedSuccess: boolean | null
  repairNeeded: boolean | null
  outcomeSource: string | null
}

export type AdaptiveRetrievalDerivedCandidate = {
  eligible: boolean
  reason: string
  trainingCaseIds: string[]
  trainingTurnIds: string[]
  metrics: {
    distinctCases: number
    outcomeTurns: number
    verifiedSuccesses: number
    verifiedFailures: number
    successRate: number | null
    injected: number
    cited: number
    unusedRate: number | null
    itemSimilaritySamples: number
    citedSimilaritySamples: number
  }
  currentPolicy: {
    learnedCorpusMaxInjected: number
    learnedCorpusMinSimilarity: number
  }
  candidatePolicy: {
    learnedCorpusMaxInjected: number
    learnedCorpusMinSimilarity: number
    sourceMix: 'unchanged'
    similarityThresholdStatus: 'unchanged_until_item_level_evidence'
  }
}

export type ControlledRetrievalCase = {
  id: string
  domain: string
}

function cleanCount(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0))
}

export function adaptiveRetrievalTrainingCaseId(source: string | null): string | null {
  const value = String(source ?? '').trim()
  if (!value || value.startsWith('failure_autopsy_retest:') || value.startsWith('adaptive_retrieval_validation:')) return null
  if (value.startsWith('evidence_utilization_benchmark:')) return value.slice('evidence_utilization_benchmark:'.length) || null
  if (value.startsWith('capability_benchmark:')) return `private:${value.slice('capability_benchmark:'.length)}`
  return null
}

/**
 * A paired 6 -> 4 validation can only prove context reduction when the live retrieval path has more
 * items available than the candidate cap. Zero/low-evidence cases are useful capability checks but
 * cannot validate this retrieval candidate and should be skipped before an expensive reasoner pair.
 */
export function adaptiveRetrievalCaseCanExerciseCap(
  estimatedLiveRelevant: unknown,
  candidateMaxInjected: unknown,
): boolean {
  return cleanCount(estimatedLiveRelevant) > cleanCount(candidateMaxInjected)
}

/**
 * Produce a conservative context-waste hypothesis only. Zero citations are NOT interpreted as proof
 * that evidence was useless. The only automatic proposal here is a smaller injection cap, and it
 * remains request-local shadow policy until independent controlled validation succeeds.
 */
export function deriveAdaptiveRetrievalCandidate(
  rows: readonly AdaptiveRetrievalTrainingRow[],
  currentSimilarity = 0.45,
): AdaptiveRetrievalDerivedCandidate {
  const latestByCase = new Map<string, AdaptiveRetrievalTrainingRow>()
  for (const row of rows) {
    if (row.verifiedSuccess == null) continue
    const caseId = adaptiveRetrievalTrainingCaseId(row.outcomeSource)
    if (!caseId || latestByCase.has(caseId)) continue
    latestByCase.set(caseId, row)
  }

  const cohort = [...latestByCase.entries()]
  const trainingCaseIds = cohort.map(([caseId]) => caseId).sort()
  const trainingTurnIds = cohort.map(([, row]) => row.turnId).filter(Boolean).sort()
  const outcomeTurns = cohort.length
  const verifiedSuccesses = cohort.filter(([, row]) => row.verifiedSuccess === true).length
  const verifiedFailures = cohort.filter(([, row]) => row.verifiedSuccess === false).length
  const injected = cohort.reduce((sum, [, row]) => sum + cleanCount(row.injected), 0)
  const cited = cohort.reduce((sum, [, row]) => sum + Math.min(cleanCount(row.injected), cleanCount(row.cited)), 0)
  const similarityItems = cohort.flatMap(([, row]) => Array.isArray(row.items) ? row.items : [])
    .filter(item => item.similarity != null && Number.isFinite(Number(item.similarity)))
  const citedSimilarityItems = similarityItems.filter(item => item.cited === true)
  const successRate = outcomeTurns > 0 ? verifiedSuccesses / outcomeTurns : null
  const unusedRate = injected > 0 ? 1 - (cited / injected) : null

  const enoughCases = outcomeTurns >= ADAPTIVE_RETRIEVAL_MIN_TRAINING_CASES
  const enoughContext = injected >= ADAPTIVE_RETRIEVAL_MIN_INJECTED_ITEMS
  const qualityStrong = successRate != null && successRate >= ADAPTIVE_RETRIEVAL_MIN_SUCCESS_RATE
  const wasteHigh = unusedRate != null && unusedRate >= ADAPTIVE_RETRIEVAL_MIN_UNUSED_RATE
  const eligible = enoughCases && enoughContext && qualityStrong && wasteHigh

  const reason = !enoughCases
    ? `Need at least ${ADAPTIVE_RETRIEVAL_MIN_TRAINING_CASES} distinct outcome-labelled cases.`
    : !enoughContext
      ? `Need at least ${ADAPTIVE_RETRIEVAL_MIN_INJECTED_ITEMS} injected learned-corpus items in the training cohort.`
      : !qualityStrong
        ? `Verified success rate is below the ${Math.round(ADAPTIVE_RETRIEVAL_MIN_SUCCESS_RATE * 100)}% shadow-candidate floor.`
        : !wasteHigh
          ? `Injected-but-uncited rate is below the ${Math.round(ADAPTIVE_RETRIEVAL_MIN_UNUSED_RATE * 100)}% context-waste trigger.`
          : 'Context-waste hypothesis is eligible for shadow validation; no live retrieval policy changes are authorized.'

  const safeSimilarity = Number.isFinite(Number(currentSimilarity))
    ? Math.max(0.20, Math.min(0.95, Number(currentSimilarity)))
    : 0.45
  return {
    eligible,
    reason,
    trainingCaseIds,
    trainingTurnIds,
    metrics: {
      distinctCases: trainingCaseIds.length,
      outcomeTurns,
      verifiedSuccesses,
      verifiedFailures,
      successRate: successRate == null ? null : Number(successRate.toFixed(4)),
      injected,
      cited,
      unusedRate: unusedRate == null ? null : Number(unusedRate.toFixed(4)),
      itemSimilaritySamples: similarityItems.length,
      citedSimilaritySamples: citedSimilarityItems.length,
    },
    currentPolicy: {
      learnedCorpusMaxInjected: LIVE_LEARNED_CORPUS_MAX_INJECTED,
      learnedCorpusMinSimilarity: safeSimilarity,
    },
    candidatePolicy: {
      // First candidate is deliberately conservative: reduce context by one third, not one half.
      learnedCorpusMaxInjected: Math.max(3, LIVE_LEARNED_CORPUS_MAX_INJECTED - 2),
      learnedCorpusMinSimilarity: safeSimilarity,
      sourceMix: 'unchanged',
      similarityThresholdStatus: 'unchanged_until_item_level_evidence',
    },
  }
}

export function selectAdaptiveRetrievalValidationCase<T extends ControlledRetrievalCase>(args: {
  cases: readonly T[]
  trainingCaseIds: readonly string[]
  priorValidationCaseIds: readonly string[]
}): T | null {
  const training = new Set(args.trainingCaseIds)
  const prior = new Set(args.priorValidationCaseIds)
  const byId = new Map(args.cases.map(test => [test.id, test.domain]))
  const trainedDomains = new Set(args.trainingCaseIds.map(caseId => byId.get(caseId)).filter((value): value is string => Boolean(value)))
  const priorDomains = new Set(args.cases.filter(test => prior.has(test.id)).map(test => test.domain))
  const available = args.cases.filter(test => !training.has(test.id) && !prior.has(test.id))
  return available.find(test => !trainedDomains.has(test.domain) && !priorDomains.has(test.domain))
    ?? available.find(test => !priorDomains.has(test.domain))
    ?? available[0]
    ?? null
}
