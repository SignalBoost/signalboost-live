import type { CosReasoningWorkerRole } from '@/lib/ai/cos/cosReasoningControlPlane'

export type ReasoningOutcomeSample = {
  turnId: string
  problemClass: string
  workerRole: CosReasoningWorkerRole
  reasonerLabel: string
  latencyMs: number
  estimatedCostUsd: number | null
  verifiedSuccess: boolean | null
  repairNeeded: boolean | null
  escalated: boolean | null
}

export type ReasoningCandidatePerformance = {
  workerRole: CosReasoningWorkerRole
  reasonerLabel: string
  verifiedOutcomes: number
  verifiedSuccesses: number
  successRate: number
  repairRate: number | null
  escalationRate: number | null
  qualityScore: number
  averageLatencyMs: number
  averageEstimatedCostUsd: number | null
  turnIds: string[]
}

export type ReasoningProblemPreference = {
  problemClass: string
  status: 'learned' | 'no_clear_winner' | 'insufficient_evidence'
  recommendedWorkerRole: CosReasoningWorkerRole | null
  recommendedReasonerLabel: string | null
  reason: string
  candidates: ReasoningCandidatePerformance[]
}

export type ReasoningOutcomeProfile = {
  generatedAt: string
  totalSamples: number
  preferences: ReasoningProblemPreference[]
  changesBehavior: boolean
}

export type ReasoningOutcomeProfileOptions = {
  now?: Date
  minimumVerifiedOutcomesPerCandidate?: number
  minimumQualityMargin?: number
  qualityTieBand?: number
  minimumEfficiencyImprovement?: number
}

export const MINIMUM_VERIFIED_OUTCOMES_PER_CANDIDATE = 8
export const MINIMUM_QUALITY_MARGIN = 0.05
export const QUALITY_TIE_BAND = 0.02
export const MINIMUM_EFFICIENCY_IMPROVEMENT = 0.20

function boundedRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.max(0, Math.min(1, numerator / denominator))
}

function round(value: number, places = 4): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function summarizeCandidate(rows: ReasoningOutcomeSample[]): ReasoningCandidatePerformance {
  const verified = rows.filter(row => row.verifiedSuccess !== null)
  const verifiedSuccesses = verified.filter(row => row.verifiedSuccess === true).length
  const repairKnown = verified.filter(row => row.repairNeeded !== null)
  const escalatedKnown = verified.filter(row => row.escalated !== null)
  const repairRate = boundedRate(repairKnown.filter(row => row.repairNeeded === true).length, repairKnown.length)
  const escalationRate = boundedRate(escalatedKnown.filter(row => row.escalated === true).length, escalatedKnown.length)
  const successRate = boundedRate(verifiedSuccesses, verified.length) ?? 0
  const qualityScore = Math.max(0, Math.min(1,
    successRate - 0.15 * (repairRate ?? 0) - 0.10 * (escalationRate ?? 0),
  ))
  const priced = verified.filter(row => row.estimatedCostUsd !== null && Number.isFinite(row.estimatedCostUsd))
  return {
    workerRole: rows[0].workerRole,
    reasonerLabel: rows[0].reasonerLabel,
    verifiedOutcomes: verified.length,
    verifiedSuccesses,
    successRate: round(successRate),
    repairRate: repairRate === null ? null : round(repairRate),
    escalationRate: escalationRate === null ? null : round(escalationRate),
    qualityScore: round(qualityScore),
    averageLatencyMs: verified.length ? Math.round(verified.reduce((sum, row) => sum + Math.max(0, row.latencyMs), 0) / verified.length) : 0,
    averageEstimatedCostUsd: priced.length
      ? round(priced.reduce((sum, row) => sum + Number(row.estimatedCostUsd), 0) / priced.length, 8)
      : null,
    turnIds: verified.map(row => row.turnId).filter(Boolean).slice(0, 40),
  }
}

function qualityOrder(a: ReasoningCandidatePerformance, b: ReasoningCandidatePerformance): number {
  const quality = b.qualityScore - a.qualityScore
  if (quality !== 0) return quality
  const aCost = a.averageEstimatedCostUsd ?? Number.POSITIVE_INFINITY
  const bCost = b.averageEstimatedCostUsd ?? Number.POSITIVE_INFINITY
  return aCost - bCost || a.averageLatencyMs - b.averageLatencyMs || a.workerRole.localeCompare(b.workerRole)
}

function efficiencyOrder(a: ReasoningCandidatePerformance, b: ReasoningCandidatePerformance): number {
  const aCost = a.averageEstimatedCostUsd ?? Number.POSITIVE_INFINITY
  const bCost = b.averageEstimatedCostUsd ?? Number.POSITIVE_INFINITY
  return aCost - bCost || a.averageLatencyMs - b.averageLatencyMs || b.qualityScore - a.qualityScore || a.workerRole.localeCompare(b.workerRole)
}

function efficiencyImprovement(winner: ReasoningCandidatePerformance, runner: ReasoningCandidatePerformance): number {
  const costComparable = winner.averageEstimatedCostUsd !== null && runner.averageEstimatedCostUsd !== null && runner.averageEstimatedCostUsd > 0
  if (costComparable) return Math.max(0, (runner.averageEstimatedCostUsd! - winner.averageEstimatedCostUsd!) / runner.averageEstimatedCostUsd!)
  if (runner.averageLatencyMs > 0) return Math.max(0, (runner.averageLatencyMs - winner.averageLatencyMs) / runner.averageLatencyMs)
  return 0
}

function preferenceFor(problemClass: string, rows: ReasoningOutcomeSample[], options: Required<Omit<ReasoningOutcomeProfileOptions, 'now'>>): ReasoningProblemPreference {
  const buckets = new Map<string, ReasoningOutcomeSample[]>()
  for (const row of rows) {
    const key = `${row.workerRole}\u0000${row.reasonerLabel}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(row)
    else buckets.set(key, [row])
  }
  const candidates = [...buckets.values()].map(summarizeCandidate).sort(qualityOrder)
  const eligible = candidates.filter(candidate => candidate.verifiedOutcomes >= options.minimumVerifiedOutcomesPerCandidate)

  if (eligible.length < 2) {
    return {
      problemClass,
      status: 'insufficient_evidence',
      recommendedWorkerRole: null,
      recommendedReasonerLabel: null,
      reason: `Need at least two worker/model alternatives with ${options.minimumVerifiedOutcomesPerCandidate} independently verified outcomes each; ${eligible.length} qualify now.`,
      candidates,
    }
  }

  const [bestQuality] = eligible
  const nearTies = eligible.filter(candidate => bestQuality.qualityScore - candidate.qualityScore <= options.qualityTieBand)
  const winner = nearTies.length > 1 ? [...nearTies].sort(efficiencyOrder)[0] : bestQuality
  const runner = eligible.filter(candidate => candidate !== winner).sort(qualityOrder)[0] ?? bestQuality
  const qualityMargin = winner.qualityScore - runner.qualityScore
  const efficiency = efficiencyImprovement(winner, runner)
  const learnedByQuality = qualityMargin >= options.minimumQualityMargin
  const learnedByEfficiency = Math.abs(qualityMargin) <= options.qualityTieBand && efficiency >= options.minimumEfficiencyImprovement

  if (!learnedByQuality && !learnedByEfficiency) {
    return {
      problemClass,
      status: 'no_clear_winner',
      recommendedWorkerRole: null,
      recommendedReasonerLabel: null,
      reason: `The leading alternatives are too close: quality margin ${round(qualityMargin * 100, 1)}%, efficiency improvement ${round(efficiency * 100, 1)}%. Keep deterministic routing.`,
      candidates,
    }
  }

  return {
    problemClass,
    status: 'learned',
    recommendedWorkerRole: winner.workerRole,
    recommendedReasonerLabel: winner.reasonerLabel,
    reason: learnedByEfficiency && !learnedByQuality
      ? `${winner.workerRole} on ${winner.reasonerLabel} is within the quality tie band and is ${round(efficiency * 100, 1)}% more efficient than the comparison alternative.`
      : `${winner.workerRole} on ${winner.reasonerLabel} leads verified quality by ${round(qualityMargin * 100, 1)} percentage points after repair/escalation penalties.`,
    candidates,
  }
}

export function deriveReasoningOutcomeProfile(samples: ReasoningOutcomeSample[], options: ReasoningOutcomeProfileOptions = {}): ReasoningOutcomeProfile {
  const cleanSamples = Array.isArray(samples)
    ? samples.filter(row => row && row.problemClass && row.workerRole && row.reasonerLabel)
    : []
  const grouped = new Map<string, ReasoningOutcomeSample[]>()
  for (const sample of cleanSamples) {
    const rows = grouped.get(sample.problemClass)
    if (rows) rows.push(sample)
    else grouped.set(sample.problemClass, [sample])
  }
  const policyOptions = {
    minimumVerifiedOutcomesPerCandidate: Math.max(2, options.minimumVerifiedOutcomesPerCandidate ?? MINIMUM_VERIFIED_OUTCOMES_PER_CANDIDATE),
    minimumQualityMargin: Math.max(0, options.minimumQualityMargin ?? MINIMUM_QUALITY_MARGIN),
    qualityTieBand: Math.max(0, options.qualityTieBand ?? QUALITY_TIE_BAND),
    minimumEfficiencyImprovement: Math.max(0, options.minimumEfficiencyImprovement ?? MINIMUM_EFFICIENCY_IMPROVEMENT),
  }
  const preferences = [...grouped.entries()]
    .map(([problemClass, rows]) => preferenceFor(problemClass, rows, policyOptions))
    .sort((a, b) => a.problemClass.localeCompare(b.problemClass))
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    totalSamples: cleanSamples.length,
    preferences,
    changesBehavior: preferences.some(preference => preference.status === 'learned'),
  }
}

export function learnedPreferenceFor(profile: ReasoningOutcomeProfile, problemClass: string): ReasoningProblemPreference | null {
  return profile.preferences.find(preference => preference.problemClass === problemClass && preference.status === 'learned') ?? null
}
