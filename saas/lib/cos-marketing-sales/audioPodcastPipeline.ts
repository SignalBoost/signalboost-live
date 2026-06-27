// saas/lib/cos-marketing-sales/audioPodcastPipeline.ts
// Organic content and audio pipeline stub.
// Produces structured JSON for a two-host casual tech dialogue before any
// external audio provider is called.

import type { CosLocale, PodcastInput, PodcastSequence, PodcastSegment } from './types'

const HOST_NAMES: Record<CosLocale, { hostA: string; hostB: string; announcer: string }> = {
  en: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  es: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  'pt-BR': { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  pl: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  ru: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
}

const COPY: Record<CosLocale, { title: string; intro: string; explain: string; ad: string; cta: string; outro: string }> = {
  en: {
    title: 'Five-minute tech brief',
    intro: 'Today we are looking at a practical business signal and what it means for growth.',
    explain: 'The important point is not just the finding, but what the owner can do next without wasting time.',
    ad: 'Mid-roll: SignalBoost helps small teams turn website signals, outreach ideas, and optimization findings into approved action plans.',
    cta: 'The next step is simple: review the signal, approve the best fix, and turn it into outreach or a customer-facing improvement.',
    outro: 'That is the quick brief. Keep the workflow practical, measurable, and owner-approved.',
  },
  es: {
    title: 'Resumen tecnológico de cinco minutos',
    intro: 'Hoy revisamos una señal práctica de negocio y lo que significa para el crecimiento.',
    explain: 'Lo importante no es solo el hallazgo, sino qué puede hacer el propietario después sin perder tiempo.',
    ad: 'Mid-roll: SignalBoost ayuda a equipos pequeños a convertir señales del sitio, ideas de outreach y hallazgos de optimización en planes aprobados.',
    cta: 'El siguiente paso es simple: revisar la señal, aprobar la mejor corrección y convertirla en outreach o mejora para el cliente.',
    outro: 'Ese fue el resumen rápido. Mantén el flujo práctico, medible y aprobado por el propietario.',
  },
  'pt-BR': {
    title: 'Resumo técnico de cinco minutos',
    intro: 'Hoje vamos analisar um sinal prático de negócio e o que ele significa para crescimento.',
    explain: 'O ponto importante não é apenas a constatação, mas o que o proprietário pode fazer depois sem perder tempo.',
    ad: 'Mid-roll: O SignalBoost ajuda equipes pequenas a transformar sinais do site, ideias de outreach e constatações de otimização em planos aprovados.',
    cta: 'O próximo passo é simples: revisar o sinal, aprovar a melhor correção e transformar isso em outreach ou melhoria para o cliente.',
    outro: 'Esse foi o resumo rápido. Mantenha o fluxo prático, mensurável e aprovado pelo proprietário.',
  },
  pl: {
    title: 'Pięciominutowy brief technologiczny',
    intro: 'Dzisiaj omawiamy praktyczny sygnał biznesowy i jego znaczenie dla wzrostu.',
    explain: 'Ważny jest nie tylko wynik, ale też to, co właściciel może zrobić dalej bez straty czasu.',
    ad: 'Mid-roll: SignalBoost pomaga małym zespołom zmieniać sygnały ze strony, pomysły outreach i wyniki optymalizacji w zatwierdzone plany działań.',
    cta: 'Następny krok jest prosty: sprawdzić sygnał, zatwierdzić najlepszą poprawkę i zamienić ją w outreach lub ulepszenie dla klienta.',
    outro: 'To był krótki brief. Proces powinien być praktyczny, mierzalny i zatwierdzany przez właściciela.',
  },
  ru: {
    title: 'Пятиминутный технологический бриф',
    intro: 'Сегодня мы рассматриваем практический бизнес-сигнал и его значение для роста.',
    explain: 'Важно не только само замечание, но и следующий шаг владельца без потери времени.',
    ad: 'Mid-roll: SignalBoost помогает небольшим командам превращать сигналы сайта, идеи outreach и результаты оптимизации в утверждённые планы действий.',
    cta: 'Следующий шаг простой: проверить сигнал, утвердить лучшее исправление и превратить его в outreach или улучшение для клиента.',
    outro: 'Это был короткий бриф. Рабочий процесс должен быть практичным, измеримым и утверждённым владельцем.',
  },
}

function normalizeLocale(locale?: string): CosLocale {
  if (locale === 'es' || locale === 'pt-BR' || locale === 'pl' || locale === 'ru') return locale
  return 'en'
}

function shorten(input: string | undefined, fallback: string, max = 360) {
  const text = String(input || fallback).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function segment(type: PodcastSegment['type'], speaker: PodcastSegment['speaker'], durationSeconds: number, text: string): PodcastSegment {
  return { id: crypto.randomUUID(), type, speaker, durationSeconds, text }
}

export function buildPodcastSequence(input: PodcastInput): PodcastSequence {
  const locale = normalizeLocale(input.locale)
  const copy = COPY[locale]
  const hosts = HOST_NAMES[locale]
  const sourceBrief = shorten(input.securityBrief || input.rawText, copy.explain)
  const midRoll = shorten(input.midRollOffer, copy.ad, 220)
  const title = shorten(input.title, copy.title, 120)

  const segments: PodcastSegment[] = [
    segment('intro', 'host_a', 35, `${copy.intro} ${title}`),
    segment('host_dialogue', 'host_b', 55, sourceBrief),
    segment('explanation', 'host_a', 70, copy.explain),
    segment('mid_roll_ad', 'announcer', 30, midRoll),
    segment('host_dialogue', 'host_b', 65, copy.cta),
    segment('cta', 'host_a', 25, `Platform: ${input.platformName || 'SignalBoost'}.`),
    segment('outro', 'host_b', 20, copy.outro),
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
