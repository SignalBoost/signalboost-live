// saas/lib/ai/cos/cosUniversityLanguageDiscoveryQuery.ts
/**
 * Discovery for a language study gap was issued in English.
 *
 * `platformLanguageStudyGapSignal` built `discoveryQuery` as `[language.title, ...englishThemes]`
 * — "Polish reading comprehension and semantic interpretation" — and every adapter searched with
 * it. Brave, crossref, openalex and official_docs all answered the question that query actually
 * asks: English writing ABOUT Polish. Material written IN Polish was never retrieved, so the
 * target-language admission path added for it (documentMatchesTargetLanguage) had nothing to fire
 * on and recorded zero admissions across an 88-run window while Polish pulled 26 documents from
 * 33 gaps, against 1549 from 93 for Computer Science.
 *
 * The relevance gate, the confidence floors and the admission tiers are untouched here. This file
 * only changes what is ASKED FOR. A document retrieved by these queries still has to clear every
 * existing bar, and English material remains reachable because the subject and question are
 * unchanged and adapters that ignore discoveryQuery are unaffected.
 *
 * These phrases are curriculum data in the same class as LANGUAGE_DIMENSION_STUDY_THEMES, which is
 * already an authored English table — this is that table rendered in the language being taught, not
 * a classifier or a matching vocabulary. Nothing reads them to make a decision.
 */

export type LanguageDiscoveryDimension =
  | 'comprehension'
  | 'writing'
  | 'instruction_following'
  | 'translation_localization'
  | 'cultural_pragmatics'

type DimensionPhrases = Record<LanguageDiscoveryDimension, readonly string[]>

type LanguageDiscoveryProfile = {
  /** Endonym of the language, used when no dimension is scoped. */
  readonly language: string
  /** Terms that bias discovery toward teaching institutions and published course material. */
  readonly academic: readonly string[]
  readonly dimensions: DimensionPhrases
}

const PROFILES: Record<string, LanguageDiscoveryProfile> = {
  es: {
    language: 'lengua española gramática y uso',
    academic: ['material didáctico universidad', 'manual de enseñanza'],
    dimensions: {
      comprehension: ['comprensión lectora', 'comprensión del contexto y del discurso', 'interpretación de textos'],
      writing: ['expresión escrita gramática y puntuación', 'redacción y corrección de textos', 'estructura del párrafo'],
      instruction_following: ['modo imperativo e instrucciones', 'instrucciones paso a paso', 'lenguaje directivo'],
      translation_localization: ['traducción y localización', 'equivalencia y fidelidad en traducción', 'adaptación cultural del texto'],
      cultural_pragmatics: ['pragmática y cortesía lingüística', 'registro y fórmulas de cortesía', 'actos de habla'],
    },
  },
  pt: {
    language: 'língua portuguesa gramática e uso',
    academic: ['material didático universidade', 'manual de ensino'],
    dimensions: {
      comprehension: ['compreensão leitora', 'compreensão de contexto e discurso', 'interpretação de textos'],
      writing: ['expressão escrita gramática e pontuação', 'redação e revisão de textos', 'estrutura do parágrafo'],
      instruction_following: ['modo imperativo e instruções', 'instruções passo a passo', 'linguagem diretiva'],
      translation_localization: ['tradução e localização', 'equivalência e fidelidade na tradução', 'adaptação cultural do texto'],
      cultural_pragmatics: ['pragmática e cortesia linguística', 'registro e fórmulas de tratamento', 'atos de fala'],
    },
  },
  pl: {
    language: 'język polski gramatyka i użycie',
    academic: ['materiały dydaktyczne uniwersytet', 'podręcznik do nauki'],
    dimensions: {
      comprehension: ['czytanie ze zrozumieniem', 'rozumienie tekstu i kontekstu', 'interpretacja tekstu'],
      writing: ['kompozycja pisemna gramatyka i interpunkcja', 'redagowanie i poprawa tekstu', 'budowa akapitu'],
      instruction_following: ['tryb rozkazujący i wykonywanie poleceń', 'instrukcje krok po kroku', 'język dyrektywny'],
      translation_localization: ['tłumaczenie i lokalizacja tekstu', 'ekwiwalencja i wierność przekładu', 'adaptacja kulturowa tekstu'],
      cultural_pragmatics: ['pragmatyka językowa i grzeczność', 'zwroty grzecznościowe i rejestr', 'akty mowy'],
    },
  },
  ru: {
    language: 'русский язык грамматика и употребление',
    academic: ['учебные материалы университет', 'учебник по языку'],
    dimensions: {
      comprehension: ['чтение и понимание текста', 'понимание контекста и смысла', 'интерпретация текста'],
      writing: ['письменная речь грамматика и пунктуация', 'редактирование и правка текста', 'построение абзаца'],
      instruction_following: ['повелительное наклонение и выполнение инструкций', 'пошаговые инструкции', 'директивная речь'],
      translation_localization: ['перевод и локализация текста', 'эквивалентность и точность перевода', 'культурная адаптация текста'],
      cultural_pragmatics: ['речевой этикет и прагматика', 'вежливые формы обращения и регистр', 'речевые акты'],
    },
  },
}

function rotate(items: readonly string[], variant: number): readonly string[] {
  if (!items.length) return items
  const offset = Math.abs(Math.floor(Number(variant) || 0)) % items.length
  return [...items.slice(offset), ...items.slice(0, offset)]
}

/**
 * Discovery query written in the language being studied, or null when there is no profile for it.
 *
 * Null is returned rather than a fallback so the caller keeps its existing English query verbatim.
 * English itself has no profile by design: an English gap's subject and question are already the
 * right search terms.
 */
export function platformLanguageDiscoveryQuery(input: {
  language: string
  dimension?: string | null
  studyVariant?: number
}): string | null {
  const language = String(input.language || '').trim().toLowerCase()
  const profile = PROFILES[language]
  if (!profile) return null

  const dimension = String(input.dimension || '').trim().toLowerCase() as LanguageDiscoveryDimension
  const phrases = profile.dimensions[dimension]
  const variant = Number(input.studyVariant || 0)

  const core = phrases?.length
    ? rotate(phrases, variant).slice(0, 2)
    : [profile.language, ...rotate(Object.values(profile.dimensions).map(list => list[0]).filter(Boolean), variant).slice(0, 1)]

  const academic = rotate(profile.academic, variant)[0]
  return [...core, academic].filter(Boolean).join(' ').trim() || null
}

/** Exposed for tests and for callers that need to know whether a lane is covered. */
export function hasPlatformLanguageDiscoveryProfile(language: string): boolean {
  return Boolean(PROFILES[String(language || '').trim().toLowerCase()])
}
