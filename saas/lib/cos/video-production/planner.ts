import type { VideoProductionFormat, VideoProductionInput, VideoProductionJob, VideoProductionTier, VideoTextOverlay } from './types'

const DEFAULT_URL = 'www.' + 'saas.signalboostapp.com'
const DEFAULT_BRAND = 'SignalBoostAi'
const DEFAULT_VOICEOVER = 'SignalBoostAi helps businesses build websites, create branded content, turn reviews into marketing posts, and prepare outreach campaigns faster. From websites to content to growth workflows, SignalBoost gives small businesses and agencies one AI-powered system to look sharper and move faster. Start building smarter today at www.saas.signalboostapp.com.'

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function tier(value?: VideoProductionTier): VideoProductionTier {
  return value || 'professional'
}

function format(value?: VideoProductionFormat): VideoProductionFormat {
  return value === 'short_video' ? 'short_video' : 'youtube'
}

function clean(value: unknown, fallback = ''): string {
  return String(value || fallback).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function duration(value: unknown, fallback = 60): number {
  const n = Number(value || fallback)
  if (!Number.isFinite(n)) return fallback
  return Math.max(15, Math.min(60, Math.round(n)))
}

function overlays(brandText: string, urlText: string, seconds: number): VideoTextOverlay[] {
  const finalStart = Math.max(0, seconds - 5)
  return [
    { text: brandText, start: 0, end: 3, role: 'brand', color: '#ffc300', position: 'center' },
    { text: urlText, start: 0, end: 5, role: 'url', color: '#1af0ff', position: 'center' },
    { text: brandText, start: finalStart, end: seconds, role: 'brand', color: '#ffc300', position: 'center' },
    { text: urlText, start: finalStart, end: seconds, role: 'url', color: '#1af0ff', position: 'center' },
  ]
}

export function buildVideoProductionJob(input: VideoProductionInput = {}): VideoProductionJob {
  const productionTier = tier(input.production_tier)
  const videoFormat = format(input.format)
  const durationSeconds = duration(input.duration_seconds, 60)
  const destinationUrl = clean(input.destination_url || input.url_text, DEFAULT_URL)
  const brandText = clean(input.brand_text, DEFAULT_BRAND)
  const urlText = clean(input.url_text || destinationUrl, DEFAULT_URL)
  const title = clean(input.title, 'SignalBoostAi promotional video')
  const hook = clean(input.hook, 'AI websites, branded content, reviews, outreach, and growth workflows in one SaaS platform.')
  const audience = clean(input.audience, 'small businesses, agencies, hotels, restaurants, and entrepreneurs')
  const voiceover = clean(input.voiceover, DEFAULT_VOICEOVER)
  const captions = clean(input.captions || input.voiceover, voiceover)
  const platforms = input.platforms?.length ? input.platforms : videoFormat === 'short_video' ? ['Shorts', 'Reels'] : ['YouTube', 'LinkedIn', 'Google Ads']
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
      aspect_ratios: videoFormat === 'short_video' ? ['9:16'] : ['16:9'],
      duration_seconds: durationSeconds,
      video_format: videoFormat,
      voice_strategy: productionTier === 'prototype' ? 'internal preview audio optional; production voiceover required before publish' : 'production voiceover required before owner render approval',
      visual_strategy: 'premium dark SaaS motion package with gold/cyan accents, dashboard UI, website previews, branded content, outreach workflow, and growth chart scenes',
      caption_strategy: 'burned-in captions plus mandatory brand and URL overlays inside the actual video frames',
      provider_adapter: process.env.COS_VIDEO_RENDER_WEBHOOK_URL ? 'external_renderer_webhook' : 'ffmpeg_internal_preview',
      voiceover_script: voiceover,
      captions,
      brand_text: brandText,
      url_text: urlText,
      mandatory_overlays: overlays(brandText, urlText, durationSeconds),
      compliance_checks: [
        `${brandText} visible inside frames from 0:00-0:03`,
        `${urlText} visible inside frames during the first 5 seconds`,
        `${brandText} and ${urlText} visible together inside frames during the final 5 seconds`,
        'Runtime is 60 seconds or less',
        'No guaranteed results promised',
        'Publish approval remains false until the owner explicitly approves',
      ],
    },
    search_package: {
      title_options: [title, `${title} | SignalBoostAi`, 'Build smarter with SignalBoostAi'],
      description: `${hook} Learn more at ${destinationUrl}.`,
      tags: ['SignalBoostAi', 'SignalBoost', 'SaaS', 'AI business tools', 'website builder', 'branded content', 'outreach'],
      thumbnail_text: hook.length > 54 ? hook.slice(0, 51) + '...' : hook,
      transcript_required: true,
      captions_required: true,
      destination_url: destinationUrl,
      transcript: voiceover,
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
