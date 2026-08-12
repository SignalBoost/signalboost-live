import { evaluateReleaseCandidateReadiness } from './readiness.ts'
import type { RcCheckCategory, RcCheckResult, RcCheckStatus, RcEvidence, RcReadinessSnapshot } from './types.ts'
import type { TenantContext } from '../autonomous-systems/types.ts'

export const MARKETING_SALES_RC_PROFILE_VERSION = '1.1.0' as const

export const MARKETING_SALES_RC_REQUIREMENTS = [
  { checkId: 'marketing_sales.deployment.production', category: 'deployment', summary: 'Production deployment builds, starts, and serves the Marketing & Sales surfaces.' },
  { checkId: 'marketing_sales.multi_tenant.isolation', category: 'multi_tenant', summary: 'Cross-tenant access is blocked and tenant-scoped Marketing & Sales data does not leak.' },
  { checkId: 'marketing_sales.security.required_gates', category: 'security', summary: 'Security, authorization, secret-handling, approval, and tenant-isolation gates pass with no open critical/high blocker.' },
  { checkId: 'marketing_sales.resilience.recovery', category: 'resilience', summary: 'Backup, restore, and declared recovery behavior are verified against the production data path.' },
  { checkId: 'marketing_sales.performance.load_soak', category: 'performance', summary: 'Sustained load/soak evidence meets the declared latency, error-rate, and duration thresholds.' },
  { checkId: 'marketing_sales.observability.coverage', category: 'observability', summary: 'Telemetry, alerts, traces, dashboards, and audit evidence cover the declared Marketing & Sales flow.' },
  { checkId: 'marketing_sales.integration.end_to_end', category: 'integration', summary: 'The configured end-to-end flow is verified across COS/EAE, Prospect, Business Intelligence Corpus, Communication, CRM, Revenue, Enterprise Memory, and Universal Adapter boundaries.' },
  { checkId: 'marketing_sales.documentation.current', category: 'documentation', summary: 'ONBOARD and Marketing & Sales architecture, corpus, RC, operator, and handoff documentation match the current repository.' },
] as const satisfies readonly { checkId: string; category: RcCheckCategory; summary: string }[]

export type MarketingSalesRcCheckId = typeof MARKETING_SALES_RC_REQUIREMENTS[number]['checkId']

export interface MarketingSalesRcEvidenceInput {
  readonly status: RcCheckStatus
  readonly evidence: readonly RcEvidence[]
  readonly summary?: string
}

export type MarketingSalesRcEvidenceMap = Partial<Record<MarketingSalesRcCheckId, MarketingSalesRcEvidenceInput>>

export interface MarketingSalesRcEvidenceCoverage {
  readonly totalRequired: number
  readonly supplied: number
  readonly passedWithEvidence: number
  readonly missingCheckIds: readonly MarketingSalesRcCheckId[]
  readonly nonPassingCheckIds: readonly MarketingSalesRcCheckId[]
}

export function getMarketingSalesRcEvidenceCoverage(evidence: MarketingSalesRcEvidenceMap = {}): MarketingSalesRcEvidenceCoverage {
  const missingCheckIds: MarketingSalesRcCheckId[] = []
  const nonPassingCheckIds: MarketingSalesRcCheckId[] = []
  let supplied = 0
  let passedWithEvidence = 0
  for (const requirement of MARKETING_SALES_RC_REQUIREMENTS) {
    const row = evidence[requirement.checkId]
    if (!row) { missingCheckIds.push(requirement.checkId); continue }
    supplied += 1
    if (row.status === 'pass' && row.evidence.length > 0) passedWithEvidence += 1
    else nonPassingCheckIds.push(requirement.checkId)
  }
  return Object.freeze({ totalRequired: MARKETING_SALES_RC_REQUIREMENTS.length, supplied, passedWithEvidence, missingCheckIds: Object.freeze(missingCheckIds), nonPassingCheckIds: Object.freeze(nonPassingCheckIds) })
}

export function buildMarketingSalesRcChecks(evidence: MarketingSalesRcEvidenceMap = {}): readonly RcCheckResult[] {
  return MARKETING_SALES_RC_REQUIREMENTS.map(requirement => {
    const supplied = evidence[requirement.checkId]
    return { checkId: requirement.checkId, category: requirement.category, required: true, status: supplied?.status ?? 'not_run', summary: supplied?.summary?.trim() || requirement.summary, evidence: supplied?.evidence ? [...supplied.evidence] : [] }
  })
}

export function evaluateMarketingSalesReleaseCandidate(input: { tenant: TenantContext; generatedAt: string; evidence?: MarketingSalesRcEvidenceMap }): RcReadinessSnapshot {
  return evaluateReleaseCandidateReadiness({ tenant: input.tenant, generatedAt: input.generatedAt, checks: buildMarketingSalesRcChecks(input.evidence) })
}
