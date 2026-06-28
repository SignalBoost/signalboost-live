export type MarketingHeroChoice = 'animated_mascot' | 'talking_head_avatar' | 'faceless_dashboard_tour'

export type MarketingFormatChoice = 'platform_tour_16x9' | 'niche_short_9x16' | 'square_feed_demo'

export type MarketingSceneDesign =
  | 'audit_scan_score_gauge'
  | 'before_after_transformation'
  | 'animated_product_cards'
  | 'branded_cta'
  | 'provider_status_walkthrough'

export type MarketingSignal = {
  source: string
  audience?: string
  region?: string
  product?: string
  format?: MarketingFormatChoice
  hero?: MarketingHeroChoice
  views?: number
  clicks?: number
  conversions?: number
  watch_seconds?: number
  confidence?: number
  notes?: string[]
}

export type MarketingDecisionInput = {
  campaign_goal?: 'traffic' | 'product_demo' | 'lead_generation' | 'monetization' | 'platform_promo'
  product_or_service?: string
  audience?: string
  region?: string
  signals?: MarketingSignal[]
}

export type MarketingDecision = {
  id: string
  recommended_hero: MarketingHeroChoice
  recommended_format: MarketingFormatChoice
  recommended_scene_designs: MarketingSceneDesign[]
  confidence_score: number
  mining_summary: string[]
  prediction_summary: string
  creative_brief: string
  storyboard_direction: string[]
  traffic_plan: string[]
  monetization_plan: string[]
  approval_required: string[]
  created_at: string
}
