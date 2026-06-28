import type { MarketingDecision, MarketingDecisionInput, MarketingFormatChoice, MarketingHeroChoice, MarketingSceneDesign, MarketingSignal } from './types'

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function rate(clicks = 0, views = 0) {
  return views > 0 ? clicks / views : 0
}

function conversionRate(conversions = 0, clicks = 0) {
  return clicks > 0 ? conversions / clicks : 0
}

function averageConfidence(signals: MarketingSignal[]) {
  if (!signals.length) return 58
  const values = signals.map(signal => signal.confidence || 55)
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function chooseFormat(input: MarketingDecisionInput): MarketingFormatChoice {
  const goal = input.campaign_goal || 'traffic'
  const signals = input.signals || []
  const bestSignal = [...signals].sort((a, b) => rate(b.clicks, b.views) - rate(a.clicks, a.views))[0]

  if (bestSignal?.format) return bestSignal.format
  if (goal === 'monetization' || goal === 'traffic') return 'niche_short_9x16'
  if (goal === 'product_demo' || goal === 'platform_promo') return 'platform_tour_16x9'
  return 'square_feed_demo'
}

function chooseHero(input: MarketingDecisionInput, format: MarketingFormatChoice): MarketingHeroChoice {
  const text = `${input.product_or_service || ''} ${input.audience || ''} ${input.region || ''}`.toLowerCase()
  const signals = input.signals || []
  const bestHeroSignal = [...signals].filter(signal => signal.hero).sort((a, b) => rate(b.clicks, b.views) - rate(a.clicks, a.views))[0]
  if (bestHeroSignal?.hero) return bestHeroSignal.hero

  if (format === 'platform_tour_16x9') return 'faceless_dashboard_tour'
  if (text.includes('owner') || text.includes('operator') || text.includes('professional')) return 'talking_head_avatar'
  return 'animated_mascot'
}

function chooseScenes(input: MarketingDecisionInput, format: MarketingFormatChoice): MarketingSceneDesign[] {
  const text = `${input.product_or_service || ''} ${input.audience || ''}`.toLowerCase()
  const scenes: MarketingSceneDesign[] = []

  if (text.includes('audit') || text.includes('review')) scenes.push('audit_scan_score_gauge')
  if (text.includes('provider') || text.includes('vercel') || text.includes('status')) scenes.push('provider_status_walkthrough')
  scenes.push('before_after_transformation')
  scenes.push(format === 'platform_tour_16x9' ? 'animated_product_cards' : 'branded_cta')
  if (!scenes.includes('branded_cta')) scenes.push('branded_cta')

  return Array.from(new Set(scenes))
}

function miningSummary(signals: MarketingSignal[]) {
  if (!signals.length) {
    return [
      'No historical performance signals found yet; COSA is using a safe starter strategy.',
      'Each generated video should be logged so future decisions can be data-driven.',
    ]
  }

  const totalViews = signals.reduce((sum, signal) => sum + (signal.views || 0), 0)
  const totalClicks = signals.reduce((sum, signal) => sum + (signal.clicks || 0), 0)
  const totalConversions = signals.reduce((sum, signal) => sum + (signal.conversions || 0), 0)
  const best = [...signals].sort((a, b) => rate(b.clicks, b.views) - rate(a.clicks, a.views))[0]

  return [
    `Mined ${signals.length} signal group(s): ${totalViews} views, ${totalClicks} clicks, ${totalConversions} conversions.`,
    best ? `Best observed signal source: ${best.source} with ${(rate(best.clicks, best.views) * 100).toFixed(1)}% click rate.` : 'No best signal available yet.',
  ]
}

export function buildMarketingDecision(input: MarketingDecisionInput = {}): MarketingDecision {
  const signals = input.signals || []
  const format = chooseFormat(input)
  const hero = chooseHero(input, format)
  const scenes = chooseScenes(input, format)
  const confidence = Math.min(92, Math.max(52, averageConfidence(signals) + (signals.length ? 8 : 0)))
  const product = input.product_or_service || 'SignalBoost SaaS console'
  const audience = input.audience || 'small business owners and operators'

  return {
    id: id('marketing_decision'),
    recommended_hero: hero,
    recommended_format: format,
    recommended_scene_designs: scenes,
    confidence_score: confidence,
    mining_summary: miningSummary(signals),
    prediction_summary: signals.length
      ? `COSA predicts ${format} with ${hero} has the strongest chance to move ${audience} toward the next traffic action.`
      : `COSA has limited data, so it recommends a low-risk starter test: ${format} with ${hero}.`,
    creative_brief: `Create a short story where the viewer immediately recognizes the problem, sees ${product} solve it, and has a clear reason to visit www.saas.signalboostapp.com.`,
    storyboard_direction: [
      'Open with a niche-specific pain point in the first three seconds.',
      `Introduce the hero style: ${hero}.`,
      `Use format: ${format}.`,
      `Show proof through: ${scenes.join(', ')}.`,
      'End with branded CTA and destination URL visible on screen.',
    ],
    traffic_plan: [
      'Drive viewers to www.saas.signalboostapp.com.',
      'Use short clips to test attention hooks before investing in longer edits.',
      'Log views, clicks, watch time, and conversions for future mining.',
    ],
    monetization_plan: [
      'Use traffic for platform signups and demos.',
      'Reuse top-performing clips as paid or partner-ready creatives later.',
      'Store performance metrics so COSA can choose better formats over time.',
    ],
    approval_required: [
      'Approve COSA-selected niche and hero.',
      'Approve storyboard before rendering.',
      'Approve final video before release.',
      'Approve any paid distribution or external posting.',
    ],
    created_at: new Date().toISOString(),
  }
}

export function defaultMarketingDecisionInput(): MarketingDecisionInput {
  return {
    campaign_goal: 'traffic',
    product_or_service: 'SignalBoost SaaS console',
    audience: 'small business owners and operators',
    region: 'global',
    signals: [
      {
        source: 'starter_signal',
        audience: 'small business owners',
        region: 'global',
        product: 'SignalBoost console',
        views: 0,
        clicks: 0,
        conversions: 0,
        confidence: 56,
        notes: ['Starter decision until campaign performance data is available.'],
      },
    ],
  }
}
