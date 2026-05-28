export type OutreachStatus = 'pending' | 'approved' | 'rejected' | 'sent'

export type BusinessAnalyzerSummary = {
  business_name: string
  business_type: string
  source_url: string
  public_summary: string
  services: string[]
  tone: string
  keywords: string[]
  pain_points: string[]
  opportunities: string[]
  evidence: string[]
  hmi_summary: string
}

export type BusinessModelProfile = {
  revenue_model: string
  pricing_style: string
  customer_segments: string[]
  operational_style: string
  marketing_maturity: 'low' | 'medium' | 'high'
  management_style: {
    involvement: 'hands_on' | 'balanced' | 'hands_off'
    orientation: 'growth' | 'stability' | 'mixed'
    preference: 'design' | 'speed' | 'cost' | 'balanced'
  }
  confidence: number
  hmi_summary: string
}

export type PredictiveNeeds = {
  likely_next_needs: Array<{
    need: 'reviews' | 'website_redesign' | 'seasonal_promotions' | 'retention_campaigns' | 'social_consistency'
    priority: 'low' | 'medium' | 'high'
    reason: string
    suggested_asset: string
  }>
  next_best_action: string
  risk_flags: string[]
  hmi_summary: string
}

export type ReviewStrategy = {
  request_templates: string[]
  follow_up_cadence: string[]
  distribution_plan: string[]
  tone_guidelines: string[]
  hmi_summary: string
}

export type SocialPlan = {
  brand_tone_summary: string
  seven_day_calendar: Array<{
    day: number
    theme: string
    caption: string
    hashtags: string[]
  }>
  post_ideas: string[]
  hmi_summary: string
}

export type PromoPlan = {
  promotional_ideas: string[]
  email_campaign: {
    subject: string
    body: string
  }
  sms_campaign: string
  flyer_message: string
  hmi_summary: string
}

export type OutreachAssets = {
  analyzer_summary: BusinessAnalyzerSummary
  business_model_profile: BusinessModelProfile
  predictive_needs: PredictiveNeeds
  website_json: unknown
  review_strategy: ReviewStrategy
  social_plan: SocialPlan
  promo_plan: PromoPlan
  outreach_message: string
}

export type OutreachQueueRow = OutreachAssets & {
  id: string
  business_id: string | null
  source_platform: string
  business_name: string
  business_url: string
  status: OutreachStatus
  created_at: string
  approved_by: string | null
  approved_at: string | null
  sent_at: string | null
}
