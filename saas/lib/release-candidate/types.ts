import type { TenantContext } from '../autonomous-systems/types.ts'

export const RC_SCHEMA_VERSION = '1.0.0' as const

export type RcCheckCategory =
  | 'deployment'
  | 'multi_tenant'
  | 'security'
  | 'resilience'
  | 'performance'
  | 'observability'
  | 'integration'
  | 'documentation'

export type RcCheckStatus = 'pass' | 'warn' | 'fail' | 'not_run'

export interface RcEvidence {
  readonly ref: string
  readonly kind: 'test' | 'deployment' | 'runbook' | 'report' | 'metric' | 'manual'
  readonly observedAt: string
}

export interface RcCheckResult {
  readonly checkId: string
  readonly category: RcCheckCategory
  readonly status: RcCheckStatus
  readonly required: boolean
  readonly summary: string
  readonly evidence: readonly RcEvidence[]
}

export interface RcReadinessInput {
  readonly tenant: TenantContext
  readonly generatedAt: string
  readonly checks: readonly RcCheckResult[]
}

export interface RcReadinessSnapshot {
  readonly schemaVersion: typeof RC_SCHEMA_VERSION
  readonly tenant: TenantContext
  readonly generatedAt: string
  readonly releaseCandidate: boolean
  readonly score: number
  readonly requiredPassRate: number
  readonly failedRequiredCheckIds: readonly string[]
  readonly warningCheckIds: readonly string[]
  readonly notRunRequiredCheckIds: readonly string[]
  readonly categoryScores: Readonly<Record<RcCheckCategory, number>>
  readonly checks: readonly RcCheckResult[]
}
