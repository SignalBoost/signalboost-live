import type { RemediationMemoryRecord } from './remediation-memory.ts'

export interface RemediationMemoryReportItem extends RemediationMemoryRecord {
  recommendation: 'eligible_for_human_review' | 'withdrawn_or_unproven'
  reason: string
}

export interface RemediationMemoryReport {
  total: number
  eligible: number
  withdrawnOrUnproven: number
  items: readonly RemediationMemoryReportItem[]
}

/** Read-only projection for owners. It never returns an execution decision. */
export function buildRemediationMemoryReport(records: readonly RemediationMemoryRecord[]): RemediationMemoryReport {
  const items = records.map(record => {
    const eligible = record.recommendationEligible && record.consecutiveFailures === 0
    const reason = eligible
      ? `${record.verifiedSuccesses} verified successes; human review is still required.`
      : record.consecutiveFailures > 0
        ? `Withdrawn after ${record.consecutiveFailures} consecutive verified failure${record.consecutiveFailures === 1 ? '' : 's'}.`
        : `Unproven: ${record.verifiedSuccesses}/3 verified successes.`
    return Object.freeze({ ...record, recommendation: eligible ? 'eligible_for_human_review' as const : 'withdrawn_or_unproven' as const, reason })
  }).sort((a, b) => Number(b.recommendation === 'eligible_for_human_review') - Number(a.recommendation === 'eligible_for_human_review') || b.updatedAt - a.updatedAt)
  const eligible = items.filter(item => item.recommendation === 'eligible_for_human_review').length
  return Object.freeze({ total: items.length, eligible, withdrawnOrUnproven: items.length - eligible, items: Object.freeze(items) })
}
