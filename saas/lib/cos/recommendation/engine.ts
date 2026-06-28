import { priorityFromScore, scoreRecommendation, scoreSignals } from './scoring'
import type { CosChannel, CosDepartment, CosRecommendation, CosSignal } from './types'

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function chooseMarketingChannel(signals: CosSignal[]): CosChannel {
  const joined = signals.map(signal => `${signal.source} ${signal.metric} ${signal.value} ${(signal.evidence || []).join(' ')}`).join(' ').toLowerCase()
  if (joined.includes('console') || joined.includes('feature') || joined.includes('demo')) return 'youtube'
  if (joined.includes('lead') || joined.includes('prospect')) return 'outreach'
  if (joined.includes('search') || joined.includes('seo')) return 'blog'
  if (joined.includes('trust') || joined.includes('security')) return 'landing_page'
  return 'linkedin'
}

function titleFor(channel: CosChannel) {
  switch (channel) {
    case 'youtube': return 'Create an educational YouTube campaign'
    case 'short_video': return 'Create a short-form video campaign'
    case 'outreach': return 'Create a targeted outreach campaign'
    case 'blog': return 'Create an SEO education campaign'
    case 'landing_page': return 'Improve a trust or feature landing page'
    case 'review_campaign': return 'Create a customer proof campaign'
    case 'email': return 'Create an email campaign'
    default: return 'Create a social growth campaign'
  }
}

export function buildRecommendation(args: {
  department?: CosDepartment
  signals: CosSignal[]
  summary?: string
  estimatedCostUsd?: number
}): CosRecommendation {
  const department = args.department || 'marketing'
  const scoreInput = scoreSignals(args.signals)
  const score = scoreRecommendation(scoreInput)
  const channel = department === 'marketing' || department === 'sales' ? chooseMarketingChannel(args.signals) : 'landing_page'

  return {
    id: id('rec'),
    department,
    title: titleFor(channel),
    summary: args.summary || 'COSA detected a growth opportunity that should be reviewed before execution.',
    recommended_channel: channel,
    priority: priorityFromScore(score),
    confidence: Math.max(0, Math.min(100, scoreInput.confidence || 50)),
    expected_roi: score >= 70 ? 'high' : score >= 45 ? 'medium' : 'unknown',
    estimated_cost_usd: args.estimatedCostUsd ?? (channel === 'youtube' ? 12 : 3),
    reason: `Recommendation score ${score}. Channel selected from ${args.signals.length} signal(s).`,
    signals: args.signals,
    approval_status: 'pending_approval',
    created_at: new Date().toISOString(),
  }
}

export function buildDefaultMarketingRecommendation(): CosRecommendation {
  return buildRecommendation({
    department: 'marketing',
    signals: [{
      source: 'cos_default',
      metric: 'platform_feature_promotion_needed',
      value: 'console_hub',
      change: 20,
      confidence: 70,
      evidence: ['SignalBoost needs recurring feature education campaigns.'],
      observed_at: new Date().toISOString(),
    }],
    summary: 'Promote a SignalBoost feature by teaching the customer problem first, then presenting the feature as the solution.',
    estimatedCostUsd: 8,
  })
}
