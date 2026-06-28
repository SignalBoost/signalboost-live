export type CosCreativeLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type CosHeroArchetype =
  | 'overwhelmed_owner'
  | 'nontechnical_operator'
  | 'growth_manager'
  | 'agency_builder'
  | 'field_consultant'

export type CosTrafficGoal =
  | 'awareness'
  | 'site_visit'
  | 'demo_intent'
  | 'waitlist_signup'
  | 'affiliate_interest'

export type CosMonetizationPath =
  | 'platform_signup'
  | 'partner_referral'
  | 'sponsored_demo'
  | 'newsletter_capture'
  | 'short_video_revenue'

export type CosHeroStrategyInput = {
  company_name: string
  product_or_service: string
  niche?: string
  audience?: string
  pain?: string
  traffic_goal?: CosTrafficGoal
  languages?: CosCreativeLanguage[]
}

export type CosHeroStrategy = {
  id: string
  niche: string
  hero_archetype: CosHeroArchetype
  hero_name: string
  hero_problem: string
  emotional_hook: string
  opening_line: string
  story_arc: string[]
  proof_moment: string
  traffic_goal: CosTrafficGoal
  destination_url: string
  monetization_paths: CosMonetizationPath[]
  short_video_angles: string[]
  approval_gates: string[]
  languages: CosCreativeLanguage[]
  created_at: string
}
