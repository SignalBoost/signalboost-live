import type { EnterpriseVideoStrategy, EnterpriseVideoStrategyInput, EnterpriseVideoTier } from './types'

const DEFAULT_URL = 'www.' + 'saas.signalboostapp.com'

function tier(input?: EnterpriseVideoTier): EnterpriseVideoTier {
  return input || 'enterprise'
}

export function buildEnterpriseVideoStrategy(input: EnterpriseVideoStrategyInput = {}): EnterpriseVideoStrategy {
  const targetTier = tier(input.budget_tier)
  const brand = input.brand_name || 'SignalBoost'
  const product = input.product_or_service || 'SignalBoost SaaS platform'
  const audience = input.audience || 'business operators, marketing leaders, and enterprise buyers'
  const platforms = input.target_platforms?.length ? input.target_platforms : ['YouTube', 'Shorts', 'LinkedIn', 'Google Ads']

  return {
    doctrine: 'Design for enterprise outcome first. SignalBoost is the first tenant and proof case, not the quality ceiling.',
    brand_name: brand,
    product_or_service: product,
    audience,
    production_plan: {
      target_tier: targetTier,
      render_standard: targetTier === 'enterprise'
        ? 'Final output must be production-grade: real MP4, clean voice, captions, branded motion, thumbnail, transcript, metadata, and approval record.'
        : 'Prototype output may be browser-rendered, but must not be presented as final production media.',
      provider_strategy: [
        'Use free/browser preview only for internal concept review.',
        'Use professional rendering pipeline for customer-facing assets.',
        'Support provider adapters for avatar, voice, motion graphics, captions, thumbnails, and final MP4 export.',
        'Treat paid AI video providers as production vendors, not optional toys, when the customer budget supports it.',
      ],
      approval_gates: [
        'Approve concept and search/distribution package.',
        'Approve script and storyboard.',
        'Approve rendered MP4 and thumbnail.',
        'Approve publishing, ad spend, and targeting before public release.',
      ],
    },
    discovery_plan: {
      target_platforms: platforms,
      search_package: [
        'Search-intent title written for the viewer query.',
        'Description with offer, keywords, URL, and clear next action.',
        'Accurate transcript and captions aligned with the spoken content.',
        'Thumbnail text that matches the video promise without clickbait.',
        'Platform-specific metadata package for each channel.',
        `Destination URL: ${DEFAULT_URL}`,
      ],
      paid_distribution_package: [
        'Campaign objective and conversion goal.',
        'Keyword and audience plan.',
        'Landing page alignment check.',
        'Ad creative variants for A/B testing.',
        'Bid and budget recommendation.',
        'Top placement monitoring plan.',
      ],
      ranking_principles: [
        'Organic ranking cannot be guaranteed; optimize relevance, engagement, and retention.',
        'Paid top placement cannot be guaranteed by budget alone; optimize bid, creative quality, landing page, assets, and auction context.',
        'COSA must measure search impressions, watch time, CTR, conversion, and cost per result after publishing.',
      ],
    },
    quality_gate: [
      'No customer-facing asset may rely on the broken browser mockup as final media.',
      'Every video must include a production tier, distribution plan, search package, and approval state.',
      'Every publish action must create a learning record for future COSA recommendations.',
    ],
    owner_rule: 'AI operates. Humans govern. Public release, paid spend, and external posting require explicit human approval.',
  }
}
