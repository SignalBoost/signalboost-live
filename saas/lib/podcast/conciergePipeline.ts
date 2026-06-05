export type PodcastIntent = 'podcast_analyzer' | 'podcast_optimizer' | 'podcast_rebuild' | 'general'
export type ConciergePipelineResult = {
  normalizedInput: string
  intent: PodcastIntent
  internalKnowledge: string[]
  externalKnowledge: string[]
  schema: Record<string, unknown>
  replyPrefix: string
}

const TRANSLATIONS: Record<string, Record<PodcastIntent, string>> = {
  en: {
    podcast_analyzer: 'I can audit the feed for audio, metadata, distribution, SEO, and accessibility scores.',
    podcast_optimizer: 'I can rewrite episode metadata, show notes, keywords, JSON-LD, and transcript-ready copy.',
    podcast_rebuild: 'I can generate a modern Podcasting 2.0 RSS rebuild with metadata and transcript payloads.',
    general: 'I can help with SignalBoost podcast workflows.',
  },
  es: {
    podcast_analyzer: 'Puedo auditar el feed con puntuaciones de audio, metadatos, distribución, SEO y accesibilidad.',
    podcast_optimizer: 'Puedo reescribir metadatos, notas, palabras clave, JSON-LD y texto listo para transcripción.',
    podcast_rebuild: 'Puedo generar una reconstrucción RSS moderna Podcasting 2.0 con metadatos y transcripciones.',
    general: 'Puedo ayudar con los flujos de podcast de SignalBoost.',
  },
  pt: {
    podcast_analyzer: 'Posso auditar o feed com notas de áudio, metadados, distribuição, SEO e acessibilidade.',
    podcast_optimizer: 'Posso reescrever metadados, notas, palavras-chave, JSON-LD e texto pronto para transcrição.',
    podcast_rebuild: 'Posso gerar uma reconstrução RSS moderna Podcasting 2.0 com metadados e transcrições.',
    general: 'Posso ajudar com fluxos de podcast da SignalBoost.',
  },
  pl: {
    podcast_analyzer: 'Mogę ocenić kanał pod kątem audio, metadanych, dystrybucji, SEO i dostępności.',
    podcast_optimizer: 'Mogę przepisać metadane, notatki, słowa kluczowe, JSON-LD i treść gotową do transkrypcji.',
    podcast_rebuild: 'Mogę wygenerować nowoczesną przebudowę RSS Podcasting 2.0 z metadanymi i transkrypcjami.',
    general: 'Mogę pomóc w procesach podcastowych SignalBoost.',
  },
  ru: {
    podcast_analyzer: 'Я могу проверить фид по аудио, метаданным, дистрибуции, SEO и доступности.',
    podcast_optimizer: 'Я могу переписать метаданные, заметки, ключевые слова, JSON-LD и текст для транскрипта.',
    podcast_rebuild: 'Я могу создать современную RSS-перестройку Podcasting 2.0 с метаданными и транскриптами.',
    general: 'Я могу помочь с подкаст-процессами SignalBoost.',
  },
}

export function normalizePodcastInput(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, 2000)
}

export function classifyPodcastIntent(input: string): PodcastIntent {
  const lower = input.toLowerCase()
  if (!/podcast|rss|episode|transcript|spotify|apple podcasts|audio feed|show notes/.test(lower)) return 'general'
  if (/rebuild|regenerate|new feed|modern rss|podcasting 2\.0|export feed/.test(lower)) return 'podcast_rebuild'
  if (/optimi[sz]e|rewrite|metadata|title|description|show notes|transcript|keywords|seo/.test(lower)) return 'podcast_optimizer'
  return 'podcast_analyzer'
}

export function getPodcastKnowledge(intent: PodcastIntent): Pick<ConciergePipelineResult, 'internalKnowledge' | 'externalKnowledge'> {
  const internalKnowledge = [
    'SignalBoost SaaS Station route /saas-station/podcasts contains Analyzer, Optimizer, and Rebuild Engine panels.',
    'Podcast outputs are JSON-safe and include raw_report, suggested_fix, generated_feed, generated_metadata, and generated_transcripts structures.',
    'The analyzer scores audio, metadata, distribution, SEO, and accessibility; recommendations use high, medium, or low priority.',
  ]
  const externalKnowledge = [
    'Apple Podcasts and Spotify require complete RSS metadata, working HTTPS enclosures, cover art, language, owner verification, and accurate categories.',
    'Podcasting 2.0 transcript tags improve accessibility, discovery, and downstream reuse.',
    'Modern growth issues include weak episode titles, missing transcripts, inconsistent show notes, poor category targeting, and non-HTTPS media URLs.',
  ]
  if (intent === 'podcast_rebuild') externalKnowledge.push('Feed rebuilds should preserve GUIDs where possible to avoid duplicate episodes in podcast directories.')
  if (intent === 'podcast_optimizer') externalKnowledge.push('Episode optimization should retain editorial meaning while improving clarity, search intent, and accessibility.')
  return { internalKnowledge, externalKnowledge }
}

export function validatePodcastOutput(intent: PodcastIntent): Record<string, unknown> {
  return {
    type: 'object',
    required: ['intent', 'answer', 'next_actions'],
    properties: {
      intent: { const: intent },
      answer: { type: 'string' },
      next_actions: { type: 'array', items: { type: 'string' } },
      json_safe_payload: { type: 'object' },
    },
  }
}

export function runPodcastConciergePipeline(input: string, languageCode: string): ConciergePipelineResult {
  const normalizedInput = normalizePodcastInput(input)
  const intent = classifyPodcastIntent(normalizedInput)
  const knowledge = getPodcastKnowledge(intent)
  const lang = TRANSLATIONS[languageCode] ? languageCode : 'en'
  return {
    normalizedInput,
    intent,
    ...knowledge,
    schema: validatePodcastOutput(intent),
    replyPrefix: TRANSLATIONS[lang][intent],
  }
}
