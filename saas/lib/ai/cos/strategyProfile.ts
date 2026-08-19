//
// THE CLOSED HALF OF THE LOOP: turning measured outcomes into a behavior recommendation.
//
// Outcomes have been recorded for a while (enterprise_campaign_memory carries human_edits,
// approved_version and performance_data; enterprise_confidence_history carries predicted vs
// observed). Nothing read any of it back to change what COS produces. This module is that reader —
// it derives, from measured campaigns only, which channel / CTA / creative actually performed and
// how often a draft needed human rework.
//
// TWO DESIGN CALLS THAT ARE THE WHOLE POINT, and are worth defending:
//
// 1. THE PROFILE IS DERIVED, NOT A STORED MUTABLE WEIGHT. The obvious design is a weights table
//    updated with `weight = weight + delta` after every campaign. That produces a number nobody can
//    explain: six months in, "CTA aggressiveness = 2.7" rests on an accumulation no one can audit,
//    it drifts unboundedly, one anomalous campaign moves it permanently, and a bad update cannot be
//    undone without discarding the whole history. Deriving on read means every recommendation
//    carries the exact campaigns it rests on, a wrong measurement self-corrects as evidence
//    accumulates, and there is no second source of truth to fall out of sync with the outcomes.
//
// 2. NOT ENOUGH EVIDENCE PRODUCES NO RECOMMENDATION, NEVER A COIN FLIP. Every dimension can return
//    'insufficient_evidence' or 'no_clear_winner', and the caller is expected to keep its existing
//    default in both cases. A learning system that always emits an opinion is indistinguishable
//    from one that has learned nothing.
//
// PURE AND MODEL-FREE. The caller supplies the rows; this decides the verdict.

/** A row from the campaign memory table. Only measured rows influence anything. */
export type CampaignOutcomeRow = {
  campaign_id?: string | null
  channel?: string | null
  cta?: string | null
  creative?: string | null
  execution_status?: string | null
  human_edits?: unknown
  approved_version?: unknown
  performance_data?: unknown
  updated_at?: string | null
}

export type StrategyDimension = 'channel' | 'cta' | 'creative'

export type VariantPerformance = {
  variant: string
  measuredCampaigns: number
  impressions: number
  clicks: number
  revenue: number
  cost: number
  /** null when there were no impressions — an unmeasurable variant is not a 0% variant. */
  clickThroughRate: number | null
  averagePerformanceScore: number
  campaignIds: string[]
}

export type DimensionRecommendation = {
  dimension: StrategyDimension
  status: 'learned' | 'no_clear_winner' | 'insufficient_evidence'
  /** null unless status is 'learned'. The caller keeps its own default in every other case. */
  recommended: string | null
  reason: string
  /** How much better the winner is than the runner-up, as a share of the runner-up. */
  relativeMargin: number | null
  variants: VariantPerformance[]
}

export type ReworkSignal = {
  status: 'learned' | 'insufficient_evidence'
  approvedCampaigns: number
  campaignsRequiringEdits: number
  /** null below the sample minimum. A rate computed from two campaigns is not a rate. */
  reworkRate: number | null
  reason: string
}

export type StrategyProfile = {
  generatedAt: string
  totalCampaigns: number
  measuredCampaigns: number
  /** Rows that exist but cannot teach anything yet — drafted, approved, published-but-unmeasured. */
  unmeasuredCampaigns: number
  dimensions: DimensionRecommendation[]
  rework: ReworkSignal
  /** True only when at least one dimension reached 'learned'. */
  changesBehavior: boolean
  summary: string
}

export type StrategyProfileOptions = {
  now?: Date
  minimumCampaignsPerVariant?: number
  minimumRelativeMargin?: number
  minimumApprovedForReworkRate?: number
}

/** Below this, a variant's rate is noise. Two campaigns can differ by 3x on luck alone. */
export const MINIMUM_CAMPAIGNS_PER_VARIANT = 5
/** The winner must beat the runner-up by this share of the runner-up, not merely edge ahead. */
export const MINIMUM_RELATIVE_MARGIN = 0.2
export const MINIMUM_APPROVED_FOR_REWORK_RATE = 8

const DIMENSIONS: StrategyDimension[] = ['channel', 'cta', 'creative']

function clean(value: unknown, max = 200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function nonNegative(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/**
 * Did a human have to change this draft before it went out? An APPROVAL IS NOT AN EDIT — approving
 * an unchanged draft is the strongest positive signal there is, and counting it as rework (as a
 * naive "every feedback row is a penalty" rule does) would teach COS to avoid producing anything
 * anyone looks at.
 */
function requiredHumanEdits(row: CampaignOutcomeRow): boolean {
  const edits = record(row.human_edits)
  return Object.keys(edits).length > 0
}

function metricsOf(row: CampaignOutcomeRow): { impressions: number; clicks: number; revenue: number; cost: number; score: number } {
  const performance = record(row.performance_data)
  const metrics = record(performance.metrics)
  return {
    impressions: nonNegative(metrics.impressions),
    clicks: nonNegative(metrics.clicks),
    revenue: nonNegative(metrics.revenue),
    cost: nonNegative(metrics.cost),
    score: nonNegative(performance.performanceScore ?? performance.score),
  }
}

function isMeasured(row: CampaignOutcomeRow): boolean {
  if (clean(row.execution_status) !== 'measured') return false
  // A row can be flagged measured and still carry nothing — a measurement run that found no data.
  // Those are observation, not evidence.
  const metrics = metricsOf(row)
  return metrics.impressions > 0 || metrics.clicks > 0 || metrics.revenue > 0
}

function summarizeVariants(rows: CampaignOutcomeRow[], dimension: StrategyDimension): VariantPerformance[] {
  const buckets = new Map<string, CampaignOutcomeRow[]>()
  for (const row of rows) {
    const variant = clean(row[dimension])
    if (!variant) continue
    const existing = buckets.get(variant)
    if (existing) existing.push(row)
    else buckets.set(variant, [row])
  }

  const variants: VariantPerformance[] = []
  for (const [variant, bucket] of buckets) {
    let impressions = 0
    let clicks = 0
    let revenue = 0
    let cost = 0
    let scoreTotal = 0
    const campaignIds: string[] = []
    for (const row of bucket) {
      const metrics = metricsOf(row)
      impressions += metrics.impressions
      clicks += metrics.clicks
      revenue += metrics.revenue
      cost += metrics.cost
      scoreTotal += metrics.score
      const id = clean(row.campaign_id, 80)
      if (id) campaignIds.push(id)
    }
    variants.push({
      variant,
      measuredCampaigns: bucket.length,
      impressions,
      clicks,
      revenue,
      cost,
      clickThroughRate: impressions > 0 ? roundTo(clicks / impressions, 5) : null,
      averagePerformanceScore: roundTo(scoreTotal / bucket.length, 4),
      campaignIds: campaignIds.slice(0, 25),
    })
  }

  return variants.sort((a, b) => b.averagePerformanceScore - a.averagePerformanceScore)
}

function recommendDimension(rows: CampaignOutcomeRow[], dimension: StrategyDimension, options: Required<Pick<StrategyProfileOptions, 'minimumCampaignsPerVariant' | 'minimumRelativeMargin'>>): DimensionRecommendation {
  const variants = summarizeVariants(rows, dimension)
  const eligible = variants.filter(v => v.measuredCampaigns >= options.minimumCampaignsPerVariant)

  if (eligible.length === 0) {
    return {
      dimension,
      status: 'insufficient_evidence',
      recommended: null,
      reason: `No ${dimension} value has ${options.minimumCampaignsPerVariant} measured campaigns yet. Keep the current default.`,
      relativeMargin: null,
      variants,
    }
  }

  if (eligible.length === 1) {
    return {
      dimension,
      status: 'insufficient_evidence',
      recommended: null,
      reason: `Only "${eligible[0].variant}" has enough measured campaigns, so there is nothing to compare it against. One option that was never tested against an alternative has not been shown to be better than one.`,
      relativeMargin: null,
      variants,
    }
  }

  const [winner, runnerUp] = eligible
  // Guard the division: a runner-up scoring exactly 0 would make any margin infinite.
  const relativeMargin = runnerUp.averagePerformanceScore > 0
    ? roundTo((winner.averagePerformanceScore - runnerUp.averagePerformanceScore) / runnerUp.averagePerformanceScore, 4)
    : winner.averagePerformanceScore > 0 ? null : 0

  if (relativeMargin !== null && relativeMargin < options.minimumRelativeMargin) {
    return {
      dimension,
      status: 'no_clear_winner',
      recommended: null,
      reason: `"${winner.variant}" leads "${runnerUp.variant}" by ${roundTo(relativeMargin * 100, 1)}%, below the ${roundTo(options.minimumRelativeMargin * 100, 0)}% margin required to call it a difference rather than noise. Keep the current default.`,
      relativeMargin,
      variants,
    }
  }

  return {
    dimension,
    status: 'learned',
    recommended: winner.variant,
    reason: `"${winner.variant}" scored ${winner.averagePerformanceScore} across ${winner.measuredCampaigns} measured campaigns versus ${runnerUp.averagePerformanceScore} for "${runnerUp.variant}" across ${runnerUp.measuredCampaigns}.`,
    relativeMargin,
    variants,
  }
}

function assessRework(rows: CampaignOutcomeRow[], minimum: number): ReworkSignal {
  // Anything that reached approval counts here, measured or not — whether a draft needed rework is
  // known at approval time and does not depend on how it later performed.
  const approved = rows.filter(row => {
    const status = clean(row.execution_status)
    return status === 'approved' || status === 'published' || status === 'measured'
  })
  const edited = approved.filter(requiredHumanEdits)

  if (approved.length < minimum) {
    return {
      status: 'insufficient_evidence',
      approvedCampaigns: approved.length,
      campaignsRequiringEdits: edited.length,
      reworkRate: null,
      reason: `${approved.length} approved campaigns is below the ${minimum} needed for a meaningful rework rate.`,
    }
  }

  const reworkRate = roundTo(edited.length / approved.length, 4)
  return {
    status: 'learned',
    approvedCampaigns: approved.length,
    campaignsRequiringEdits: edited.length,
    reworkRate,
    reason: `${edited.length} of ${approved.length} approved campaigns needed human edits before going out. A rising rate means COS drafts are drifting from what is actually approved; a falling one means it is learning the house style.`,
  }
}

/**
 * Derive what COS should do differently, from measured outcomes alone.
 *
 * The caller applies a recommendation only where status is 'learned'. Every other status means the
 * evidence does not support a change, and the existing default stands.
 */
export function deriveStrategyProfile(rows: CampaignOutcomeRow[], options: StrategyProfileOptions = {}): StrategyProfile {
  const now = options.now ?? new Date()
  const minimumCampaignsPerVariant = Math.max(1, options.minimumCampaignsPerVariant ?? MINIMUM_CAMPAIGNS_PER_VARIANT)
  const minimumRelativeMargin = Math.max(0, options.minimumRelativeMargin ?? MINIMUM_RELATIVE_MARGIN)
  const minimumApprovedForReworkRate = Math.max(1, options.minimumApprovedForReworkRate ?? MINIMUM_APPROVED_FOR_REWORK_RATE)

  const all = Array.isArray(rows) ? rows : []
  const measured = all.filter(isMeasured)

  const dimensions = DIMENSIONS.map(dimension => recommendDimension(measured, dimension, {
    minimumCampaignsPerVariant,
    minimumRelativeMargin,
  }))
  const rework = assessRework(all, minimumApprovedForReworkRate)
  const learned = dimensions.filter(d => d.status === 'learned')

  const summary = measured.length === 0
    ? `NO MEASURED OUTCOMES — ${all.length} campaign rows exist but none carries measured performance, so nothing here can change COS behavior yet. Campaign measurement runs ${'COS_MEASURE_DELAY_HOURS'} after publication; if published campaigns are never becoming measured, that pipeline is the thing to fix first.`
    : learned.length === 0
      ? `NO CHANGE RECOMMENDED — ${measured.length} measured campaigns, but no dimension has both enough campaigns per option and a large enough gap between options. This is the honest answer, not a failure.`
      : `${learned.length} of ${dimensions.length} dimensions learned from ${measured.length} measured campaigns: ${learned.map(d => `${d.dimension} → "${d.recommended}"`).join(', ')}.`

  return {
    generatedAt: now.toISOString(),
    totalCampaigns: all.length,
    measuredCampaigns: measured.length,
    unmeasuredCampaigns: all.length - measured.length,
    dimensions,
    rework,
    changesBehavior: learned.length > 0,
    summary,
  }
}

/**
 * The applied view: what a generator should actually use. Returns only the dimensions that reached
 * 'learned', so a caller can spread it over its defaults and get no change when nothing was learned.
 */
export function appliedStrategyOverrides(profile: StrategyProfile): Partial<Record<StrategyDimension, string>> {
  const overrides: Partial<Record<StrategyDimension, string>> = {}
  for (const dimension of profile.dimensions) {
    if (dimension.status === 'learned' && dimension.recommended) overrides[dimension.dimension] = dimension.recommended
  }
  return overrides
}
