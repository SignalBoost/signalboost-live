export type VideoProductionTier = 'prototype' | 'professional' | 'enterprise'

export type VideoProductionStatus =
  | 'planned'
  | 'queued'
  | 'rendering'
  | 'rendered'
  | 'approved'
  | 'rejected'
  | 'failed'

export type VideoProductionFormat = 'youtube' | 'short_video'

export type VideoTextOverlay = {
  text: string
  start: number
  end: number
  role: 'brand' | 'url' | 'caption' | 'headline' | 'cta' | 'compliance'
  color?: string
  position?: 'center' | 'top' | 'bottom'
}

export type VideoProductionInput = {
  title?: string
  concept_id?: string
  production_tier?: VideoProductionTier
  platforms?: string[]
  hook?: string
  audience?: string
  destination_url?: string
  format?: VideoProductionFormat
  duration_seconds?: number
  voiceover?: string
  captions?: string
  brand_text?: string
  url_text?: string
}

export type VideoRenderSpec = {
  format: 'mp4'
  aspect_ratios: string[]
  duration_seconds: number
  video_format: VideoProductionFormat
  voice_strategy: string
  visual_strategy: string
  caption_strategy: string
  provider_adapter: string
  voiceover_script: string
  captions: string
  brand_text: string
  url_text: string
  mandatory_overlays: VideoTextOverlay[]
  compliance_checks: string[]
}

export type VideoSearchPackage = {
  title_options: string[]
  description: string
  tags: string[]
  thumbnail_text: string
  transcript_required: boolean
  captions_required: boolean
  destination_url: string
  transcript?: string
}

export type VideoApprovalState = {
  concept_approved: boolean
  script_approved: boolean
  render_approved: boolean
  publish_approved: boolean
}

export type VideoProductionJob = {
  id: string
  title: string
  status: VideoProductionStatus
  production_tier: VideoProductionTier
  platforms: string[]
  hook: string
  audience: string
  render_spec: VideoRenderSpec
  search_package: VideoSearchPackage
  approval_state: VideoApprovalState
  output_url?: string | null
  thumbnail_url?: string | null
  error?: string | null
  created_at: string
  updated_at: string
}
