import { detectLanguage } from '../ai/intentRouter'
import type { IntentRoute, OrchestrationModule } from './types'

const MODULE_HREFS: Record<OrchestrationModule, string> = {
  promote_business: '/dashboard/promote',
  build_website: '/dashboard/builder',
  collect_reviews: '/dashboard/reviews',
  generate_audio: '/dashboard/audio',
  create_videos: '/dashboard/video',
  improve_website: '/dashboard/improve-website',
  optimize_podcast_studio: '/dashboard/podcast-studio',
  lab: '/dashboard/lab',
  workshop_apprentice: '/dashboard/apprentice',
}

const KEYWORDS: Record<OrchestrationModule, string[]> = {
  promote_business: ['promote', 'campaign', 'ad ', 'ads', 'marketing', 'launch', 'social', 'business', 'sell', 'sales'],
  build_website: ['build website', 'new website', 'site', 'landing page', 'homepage', 'publish', 'domain'],
  collect_reviews: ['review', 'reviews', 'testimonial', 'rating', 'feedback', 'reputation'],
  generate_audio: ['audio', 'voice', 'voiceover', 'tts', 'narration', 'sound', 'podcast script'],
  create_videos: ['video', 'clip', 'reel', 'shorts', 'tiktok', 'caption', 'subtitle'],
  improve_website: ['audit', 'improve website', 'seo', 'speed', 'conversion', 'accessibility', 'optimize site'],
  optimize_podcast_studio: ['podcast', 'episode', 'studio', 'show notes', 'transcript', 'mic', 'noise'],
  lab: ['lab', 'experiment', 'prototype', 'test idea', 'beta'],
  workshop_apprentice: ['teach', 'tutorial', 'apprentice', 'learn', 'walkthrough', 'guide me', 'how do i'],
}

function score(text: string, words: string[]) {
  return words.reduce((count, word) => count + (text.includes(word) ? 1 : 0), 0)
}

export function routeOrchestrationIntent(input: string): IntentRoute & { language: string } {
  const text = input.trim().toLowerCase()
  const language = detectLanguage(input)
  const scored = (Object.entries(KEYWORDS) as Array<[OrchestrationModule, string[]]>)
    .map(([module, words]) => ({ module, score: score(text, words) }))
    .sort((a, b) => b.score - a.score)
  const winner = scored[0]
  const module = winner.score > 0 ? winner.module : 'promote_business'
  const total = scored.reduce((sum, item) => sum + item.score, 0)
  const confidence = winner.score > 0 && total > 0 ? Math.min(0.96, 0.55 + winner.score / Math.max(total, 1)) : 0.52
  return {
    module,
    href: MODULE_HREFS[module],
    confidence,
    reason: winner.score > 0 ? `Matched ${winner.score} orchestration keyword(s).` : 'No precise match; defaulted to business promotion.',
    language,
  }
}

export { MODULE_HREFS }
