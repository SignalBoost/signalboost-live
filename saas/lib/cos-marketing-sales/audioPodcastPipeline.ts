// saas/lib/cos-marketing-sales/audioPodcastPipeline.ts
// Organic media and audio pipeline stub.
// Produces structured JSON for a five-minute, two-host casual tech dialogue.
// Text is resolved through COS translation blocks before any future external
// audio provider call such as AutoContent or ElevenLabs.

import type { CosLocale, PodcastInput, PodcastSequence, PodcastSegment } from './types'
import { buildCosTranslationBlock, resolveCosTranslationBlock, type CosCopyKey } from './translationBlocks'

const HOST_NAMES: Record<CosLocale, { hostA: string; hostB: string; announcer: string }> = {
  en: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  es: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  'pt-BR': { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  pl: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  ru: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
}

function normalizeLocale(locale?: string): CosLocale {
  if (locale === 'es' || locale === 'pt-BR' || locale === 'pl' || locale === 'ru') return locale
  return 'en'
}

function shorten(input: string | undefined, fallback: string, max = 360) {
  const text = String(input || fallback).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function translated(locale: CosLocale, key: CosCopyKey, variables: Record<string, string | number | boolean> = {}) {
  return resolveCosTranslationBlock(buildCosTranslationBlock({ key, namespace: 'audio', locale, variables }))
}

function segment(type: PodcastSegment['type'], speaker: PodcastSegment['speaker'], durationSeconds: number, text: string): PodcastSegment {
  return { id: crypto.randomUUID(), type, speaker, durationSeconds, text }
}

export function buildPodcastSequence(input: PodcastInput): PodcastSequence {
  const locale = normalizeLocale(input.locale)
  const hosts = HOST_NAMES[locale]
  const title = shorten(input.title, translated(locale, 'cos.audio.title.fiveMinuteTechBrief'), 120)
  const sourceBrief = shorten(input.securityBrief || input.rawText, translated(locale, 'cos.audio.segment.explanation'))
  const midRoll = shorten(input.midRollOffer, translated(locale, 'cos.audio.segment.midRollSignalBoostPro'), 260)

  const segments: PodcastSegment[] = [
    segment('intro', 'host_a', 35, translated(locale, 'cos.audio.segment.intro', { topic: title })),
    segment('host_dialogue', 'host_b', 55, translated(locale, 'cos.audio.segment.hostDialogue', { brief: sourceBrief })),
    segment('explanation', 'host_a', 70, translated(locale, 'cos.audio.segment.explanation')),
    segment('mid_roll_ad', 'announcer', 30, midRoll),
    segment('host_dialogue', 'host_b', 65, translated(locale, 'cos.audio.segment.cta')),
    segment('cta', 'host_a', `SignalBoost ${input.platformName || 'Pro'}`.length > 0 ? 25 : 25, translated(locale, 'cos.audio.segment.midRollSignalBoostPro')),
    segment('outro', 'host_b', 20, translated(locale, 'cos.audio.segment.outro')),
  ]

  return {
    id: crypto.randomUUID(),
    locale,
    durationSeconds: segments.reduce((sum, item) => sum + item.durationSeconds, 0),
    title,
    hosts: { hostA: hosts.hostA, hostB: hosts.hostB },
    segments,
    providerPlan: {
      provider: 'mock',
      voiceMode: 'two_host_conversation',
      requiresApiKey: false,
      externalDispatch: false,
    },
  }
}
