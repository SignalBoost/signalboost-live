import type { CosReasoningWorkerRole } from '@/lib/ai/cos/cosReasoningControlPlane'

export const COS_COMPARISON_ROLES: readonly CosReasoningWorkerRole[] = ['primary', 'coder', 'critic', 'verifier', 'researcher'] as const
export const MAX_REASONING_COMPARISON_CANDIDATES = 2
export const MAX_REASONING_COMPARISON_CASES = 1
export const MAX_REASONING_COMPARISON_EVALUATIONS = MAX_REASONING_COMPARISON_CANDIDATES * MAX_REASONING_COMPARISON_CASES

export type ReasoningComparisonCandidate = {
  id: string
  workerRole: CosReasoningWorkerRole
}

export type ReasoningComparisonResultLike = {
  candidateId: string
  passed: boolean
  verifiedOutcomeRecorded: boolean
}

export type ReasoningComparisonSummary = {
  attempted: number
  verified: number
  passed: number
  byCandidate: Array<{
    candidateId: string
    attempted: number
    verified: number
    passed: number
  }>
}

export function isReasoningComparisonRole(value: unknown): value is CosReasoningWorkerRole {
  return COS_COMPARISON_ROLES.includes(value as CosReasoningWorkerRole)
}

export function normalizeReasoningComparisonCandidates(value: unknown): ReasoningComparisonCandidate[] {
  if (!Array.isArray(value) || value.length !== MAX_REASONING_COMPARISON_CANDIDATES) {
    throw new Error(`Controlled COS comparison requires exactly ${MAX_REASONING_COMPARISON_CANDIDATES} worker roles.`)
  }
  const roles = value.map(item => String(item ?? '').trim())
  if (roles.some(role => !isReasoningComparisonRole(role))) {
    throw new Error(`Comparison roles must be one of: ${COS_COMPARISON_ROLES.join(', ')}.`)
  }
  if (new Set(roles).size !== roles.length) {
    throw new Error('Controlled COS comparison candidates must use different worker roles.')
  }
  return roles.map((workerRole, index) => ({
    id: `${workerRole}-${index + 1}`,
    workerRole: workerRole as CosReasoningWorkerRole,
  }))
}

export function summarizeReasoningComparison(results: readonly ReasoningComparisonResultLike[]): ReasoningComparisonSummary {
  const rows = Array.isArray(results) ? results : []
  const candidateIds = [...new Set(rows.map(row => String(row.candidateId || '').trim()).filter(Boolean))]
  const byCandidate = candidateIds.map(candidateId => {
    const candidateRows = rows.filter(row => row.candidateId === candidateId)
    return {
      candidateId,
      attempted: candidateRows.length,
      verified: candidateRows.filter(row => row.verifiedOutcomeRecorded).length,
      passed: candidateRows.filter(row => row.verifiedOutcomeRecorded && row.passed).length,
    }
  })
  return {
    attempted: rows.length,
    verified: rows.filter(row => row.verifiedOutcomeRecorded).length,
    passed: rows.filter(row => row.verifiedOutcomeRecorded && row.passed).length,
    byCandidate,
  }
}
