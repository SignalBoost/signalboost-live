import type { AIMode, ModeSelection, OrchestrationModule } from './types'

const MODULE_MODE: Record<OrchestrationModule, AIMode> = {
  promote_business: 'copywriting',
  build_website: 'seo',
  collect_reviews: 'review_collection',
  generate_audio: 'audio_enhancement',
  create_videos: 'video_clipping',
  improve_website: 'website_audit',
  optimize_podcast_studio: 'podcast_optimization',
  lab: 'translation_i18n',
  workshop_apprentice: 'outreach_generation',
}

const FALLBACK_MODE: Record<AIMode, AIMode> = {
  copywriting: 'outreach_generation',
  seo: 'copywriting',
  audio_enhancement: 'copywriting',
  video_clipping: 'copywriting',
  website_audit: 'seo',
  podcast_optimization: 'audio_enhancement',
  outreach_generation: 'copywriting',
  review_collection: 'outreach_generation',
  translation_i18n: 'copywriting',
}

export function selectAIMode(module: OrchestrationModule, input: string): ModeSelection {
  const lower = input.toLowerCase()
  let mode = MODULE_MODE[module]
  if (lower.includes('translate') || lower.includes('localize') || lower.includes('i18n')) mode = 'translation_i18n'
  if (lower.includes('seo') || lower.includes('rank')) mode = 'seo'
  if (lower.includes('outreach') || lower.includes('email')) mode = 'outreach_generation'
  return {
    mode,
    fallbackMode: FALLBACK_MODE[mode],
    confidence: lower.length > 24 ? 0.86 : 0.68,
    reason: `Selected ${mode} for ${module}.`,
  }
}
