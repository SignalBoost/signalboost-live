// Deterministic normalization for campaign learning outcomes.
// Pure and provider-neutral so lifecycle routes can validate evidence before persistence.

export type CampaignPerformanceMetrics = {
  impressions?: number | null
  clicks?: number | null
  conversions?: number | null
  revenue?: number | null
  cost?: number | null
}

export type CampaignLearningInput = {
  generatedVersion?: Record<string, unknown> | null
  humanEdits?: Record<string, unknown> | null
  approvedVersion?: Record<string, unknown> | null
  publishedVersion?: Record<string, unknown> | null
  rejectedSuggestions?: unknown[] | null
  metrics?: CampaignPerformanceMetrics | null
  winningCta?: string | null
  winningCreative?: string | null
  publishedAt?: string | null
}

export type CampaignLearningRecord = {
  generatedVersion: Record<string, unknown>
  humanEdits: Record<string, unknown>
  approvedVersion: Record<string, unknown>
  publishedVersion: Record<string, unknown>
  rejectedSuggestions: unknown[]
  metrics: Required<CampaignPerformanceMetrics>
  performanceScore: number
  winningCta: string
  winningCreative: string
  publishedAt: string | null
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

function nonNegative(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function text(value: unknown, max = 4000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function validPastDate(value: unknown, now: number): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp) || timestamp > now) return null
  return new Date(timestamp).toISOString()
}

export function calculateCampaignPerformanceScore(metrics: CampaignPerformanceMetrics = {}): number {
  const impressions = nonNegative(metrics.impressions)
  const clicks = Math.min(nonNegative(metrics.clicks), impressions || Number.MAX_SAFE_INTEGER)
  const conversions = Math.min(nonNegative(metrics.conversions), clicks || Number.MAX_SAFE_INTEGER)
  const revenue = nonNegative(metrics.revenue)
  const cost = nonNegative(metrics.cost)

  const ctr = impressions > 0 ? clicks / impressions : 0
  const conversionRate = clicks > 0 ? conversions / clicks : 0
  const roi = cost > 0 ? Math.max(-1, Math.min(4, (revenue - cost) / cost)) : revenue > 0 ? 1 : 0
  const score = Math.min(1, ctr * 4 + conversionRate * 3 + Math.max(0, roi) * 0.15)
  return Math.round(score * 10000) / 10000
}

export function normalizeCampaignLearning(
  input: CampaignLearningInput,
  now = Date.now(),
): CampaignLearningRecord {
  if (!Number.isFinite(now)) throw new Error('Campaign learning clock must be finite.')

  const metrics = {
    impressions: nonNegative(input.metrics?.impressions),
    clicks: nonNegative(input.metrics?.clicks),
    conversions: nonNegative(input.metrics?.conversions),
    revenue: nonNegative(input.metrics?.revenue),
    cost: nonNegative(input.metrics?.cost),
  }

  return {
    generatedVersion: object(input.generatedVersion),
    humanEdits: object(input.humanEdits),
    approvedVersion: object(input.approvedVersion),
    publishedVersion: object(input.publishedVersion),
    rejectedSuggestions: Array.isArray(input.rejectedSuggestions) ? input.rejectedSuggestions.slice(0, 50) : [],
    metrics,
    performanceScore: calculateCampaignPerformanceScore(metrics),
    winningCta: text(input.winningCta, 500),
    winningCreative: text(input.winningCreative, 4000),
    publishedAt: validPastDate(input.publishedAt, now),
  }
}
