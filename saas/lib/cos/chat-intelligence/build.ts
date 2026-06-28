import { buildMarketingDecision, defaultMarketingDecisionInput } from '../marketing-decision'
import { buildPresenterVideoDraft } from '../presenter-video'
import type { CosChatIntelligence, CosChatIntelligenceInput } from './types'

const DEFAULT_URL = 'www.' + 'saas.signalboostapp.com'

function inferGoal(text: string) {
  const lower = text.toLowerCase()
  if (lower.includes('video') || lower.includes('short') || lower.includes('tour')) return 'traffic' as const
  if (lower.includes('lead')) return 'lead_generation' as const
  if (lower.includes('demo')) return 'product_demo' as const
  return 'platform_promo' as const
}

function inferAudience(text: string, fallback?: string) {
  if (fallback) return fallback
  const lower = text.toLowerCase()
  if (lower.includes('small business')) return 'small business owners and operators'
  if (lower.includes('company')) return 'companies that need a clearer operating console'
  return 'small business owners and operators'
}

export function buildCosChatIntelligence(input: CosChatIntelligenceInput = {}): CosChatIntelligence {
  const text = input.user_text || ''
  const defaults = defaultMarketingDecisionInput()
  const audience = inferAudience(text, input.audience)
  const product = input.product_or_service || 'SignalBoost SaaS platform'
  const region = input.region || 'global'

  const marketingDecision = buildMarketingDecision({
    ...defaults,
    campaign_goal: inferGoal(text),
    product_or_service: product,
    audience,
    region,
    signals: input.external_signals?.map(signal => ({
      source: `${signal.source_type}:${signal.source_name}`,
      audience: signal.audience,
      region: signal.region,
      product: signal.product,
      format: signal.observed_format,
      hero: signal.observed_hero,
      views: signal.views,
      clicks: signal.clicks,
      conversions: signal.conversions,
      watch_seconds: signal.watch_seconds,
      confidence: signal.confidence,
      notes: signal.notes,
    })) || defaults.signals,
  })

  const presenterVideo = buildPresenterVideoDraft({
    product_or_service: product,
    audience,
    duration_seconds: 25,
    tone: 'professional_friendly',
    destination_url: DEFAULT_URL,
  })

  const formatted = [
    'COS MARKETING INTELLIGENCE RESULT',
    `Decision: ${marketingDecision.recommended_hero} / ${marketingDecision.recommended_format} / ${marketingDecision.confidence_score}% confidence`,
    `Prediction: ${marketingDecision.prediction_summary}`,
    `Presenter: ${presenterVideo.presenter_name} — ${presenterVideo.opening_hook}`,
    `CTA: ${presenterVideo.cta}`,
    '',
    'Scene plan:',
    ...presenterVideo.scenes.map((scene, index) => `${index + 1}. ${scene.caption}: ${scene.presenter_line}`),
    '',
    'Traffic plan:',
    ...marketingDecision.traffic_plan.map(item => `- ${item}`),
    '',
    'Monetization plan:',
    ...marketingDecision.monetization_plan.map(item => `- ${item}`),
    '',
    'Human approval required before release, posting, sending, paid distribution, or spending.',
  ].join('\n')

  return {
    ok: true,
    summary: 'COSA consulted the marketing decision engine and presenter-video engine before answering.',
    marketing_decision: marketingDecision,
    presenter_video: presenterVideo,
    external_signal_count: input.external_signals?.length || 0,
    formatted_for_chat: formatted,
  }
}
