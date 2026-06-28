import type { CosSignal } from '../recommendation/types'

export type NicheVideoObjective = 'awareness' | 'education' | 'lead_generation' | 'conversion' | 'trust_building'

export type VideoDistributionChannel = 'long_form_video' | 'short_vertical_video' | 'professional_feed' | 'community_feed' | 'website_embed' | 'email_embed'

export type VideoDistributionVariant = {
  channel: VideoDistributionChannel
  format: 'long_form' | 'short_form' | 'square' | 'vertical' | 'embed'
  duration_seconds: number
  adaptation_note: string
}

export type NicheVideoStrategyInput = {
  company_name: string
  product_or_service: string
  niche: string
  target_audience: string
  objective: NicheVideoObjective
  signals: CosSignal[]
  predicted_need: string
  primary_pain: string
  desired_action: string
  languages: Array<'en' | 'es' | 'pt' | 'pl' | 'ru'>
  preferred_channels?: VideoDistributionChannel[]
}

export type NicheVideoConcept = {
  id: string
  title: string
  niche: string
  audience: string
  product_or_service: string
  objective: NicheVideoObjective
  angle: string
  hook: string
  promise: string
  proof_points: string[]
  scenes: Array<{
    label: string
    purpose: string
    narration_direction: string
    visual_direction: string
  }>
  call_to_action: string
  recommended_channels: VideoDistributionChannel[]
  channel_variants: VideoDistributionVariant[]
  approval_gates: string[]
  signals_used: CosSignal[]
  created_at: string
}
