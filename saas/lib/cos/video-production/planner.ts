import type { VideoProductionInput, VideoProductionJob, VideoProductionTier } from './types'

const DEFAULT_URL = 'www.' + 'saas.signalboostapp.com'

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function tier(value?: VideoProductionTier): VideoProductionTier {
  return value || 'enterprise'
}

export function buildVideoProductionJob(input: VideoProductionInput = {}): VideoProductionJob {
  const productionTier = tier(input.production_tier)
  const destinationUrl = input.destination_url || DEFAULT_URL
  const title = input.title || 'SignalBoost enterprise product video'
  const hook = input.hook || 'See how SignalBoost turns scattered business work into approved action.'
  const audience = input.audience || 'business owners, marketing leaders, and enterprise operators'
  const platforms = input.platforms?.length ? input.platforms : ['YouTube', 'Shorts', 'LinkedIn', 'Google Ads']
  const now = new Date().toISOString()

  return {
    id: id('video_job'),
    title,
    status: 'planned',
    production_tier: productionTier,
    platforms,
    hook,
    audience,
    render_spec: {
      format: 'mp4',
      aspect_ratios: ['16:9', '9:16'],
      duration_seconds: productionTier === 'enterprise' ? 45 : 30,
      voice_strategy: productionTier === 'prototype' ? 'browser voice for internal preview only' : 'production voice provider or approved brand voice',
      visual_strategy: productionTier === 'prototype' ? 'internal storyboard preview only' : 'branded motion package with product screenshots, captions, transitions, and CTA frame',
      caption_strategy: 'burned-in captions plus transcript file for platform search',
      provider_adapter: productionTier === 'prototype' ? 'internal_preview' : 'production_renderer_adapter',
    },
    search_package: {
      title_options: [
        title,
        `${title} | SignalBoost AI business platform`,
        `How ${title.toLowerCase()} helps teams move faster`,
      ],
      description: `${hook} Learn more at ${destinationUrl}.`,
      tags: ['SignalBoost', 'business automation', 'AI business tools', 'reviews', 'website audit', 'marketing operations'],
      thumbnail_text: hook.length > 54 ? hook.slice(0, 51) + '...' : hook,
      transcript_required: true,
      captions_required: true,
      destination_url: destinationUrl,
    },
    approval_state: {
      concept_approved: false,
      script_approved: false,
      render_approved: false,
      publish_approved: false,
    },
    output_url: null,
    thumbnail_url: null,
    error: null,
    created_at: now,
    updated_at: now,
  }
}
