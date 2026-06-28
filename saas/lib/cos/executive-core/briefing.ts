import { buildDefaultMarketingRecommendation } from '../recommendation/engine'
import type { CosRecommendation } from '../recommendation/types'
import { getSignalBoostGoals } from './goals'
import type { CosLocale, ExecutiveBriefing, ExecutiveBriefingItem, ExecutiveMetric } from './types'

function normalizeLocale(locale?: string): CosLocale {
  const value = (locale || 'en').slice(0, 2).toLowerCase()
  if (value === 'es' || value === 'pt' || value === 'pl' || value === 'ru') return value
  return 'en'
}

function recommendationToBriefingItem(recommendation: CosRecommendation): ExecutiveBriefingItem {
  return {
    id: recommendation.id,
    title: recommendation.title,
    summary: recommendation.summary,
    priority: recommendation.priority,
    confidence: recommendation.confidence,
    evidence: recommendation.signals.flatMap(signal => signal.evidence || []).slice(0, 5),
    recommended_action: `Prepare a ${recommendation.recommended_channel} campaign for owner approval.`,
    approval_required: recommendation.approval_status === 'pending_approval',
  }
}

function buildMetrics(): ExecutiveMetric[] {
  return [
    {
      id: 'marketing_sales_loop',
      label: 'Marketing & Sales loop',
      value: 'Foundation active',
      status: 'watch',
      explanation: 'The first autonomous COS loop is being built around recommendations, approval, execution, measurement, and learning.',
    },
    {
      id: 'human_governance',
      label: 'Governance mode',
      value: 'Approval required',
      status: 'healthy',
      explanation: 'COSA can prepare work, but publishing, sending, and spending remain behind owner approval.',
    },
    {
      id: 'customer_one',
      label: 'Customer #1',
      value: 'SignalBoost',
      status: 'healthy',
      explanation: 'COS capabilities must prove measurable value inside SignalBoost before being sold externally.',
    },
  ]
}

export function buildExecutiveBriefing(args: {
  locale?: string
  recommendations?: CosRecommendation[]
} = {}): ExecutiveBriefing {
  const locale = normalizeLocale(args.locale)
  const recommendations = args.recommendations?.length ? args.recommendations : [buildDefaultMarketingRecommendation()]

  return {
    generated_at: new Date().toISOString(),
    locale,
    headline: 'COSA is now operating from goals, recommendations, approval, and learning — not isolated features.',
    operating_principle: 'AI operates. Humans govern. Data informs. COS decides. Humans approve.',
    goals: getSignalBoostGoals(),
    metrics: buildMetrics(),
    recommendations: recommendations.map(recommendationToBriefingItem),
    next_actions: [
      'Connect live Recommendation API cards to the COSA dashboard.',
      'Move approved recommendations into the campaign queue.',
      'Build the first Script Worker that turns an approved campaign into a YouTube script.',
      'Persist decisions, results, and lessons into Corporate Memory.',
    ],
  }
}
