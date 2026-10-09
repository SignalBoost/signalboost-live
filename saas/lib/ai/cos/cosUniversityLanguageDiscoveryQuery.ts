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
  de: {
    language: 'deutsche Sprache Grammatik und Sprachgebrauch',
    academic: ['Lehrmaterial Universität', 'Lehrbuch Deutsch'],
    dimensions: {
      comprehension: ['Leseverstehen', 'Textverständnis und Kontext', 'Textinterpretation'],
      writing: ['schriftlicher Ausdruck Grammatik und Zeichensetzung', 'Texte verfassen und überarbeiten', 'Absatzaufbau'],
      instruction_following: ['Imperativ und Handlungsanweisungen', 'Schritt-für-Schritt-Anleitungen', 'direktive Sprache'],
      translation_localization: ['Übersetzung und Lokalisierung', 'Äquivalenz und Treue in der Übersetzung', 'kulturelle Anpassung von Texten'],
      cultural_pragmatics: ['Pragmatik und sprachliche Höflichkeit', 'Register und Anredeformen', 'Sprechakte'],
    },
  },
  fr: {
    language: 'langue française grammaire et usage',
    academic: ['support pédagogique université', 'manuel d’enseignement'],
    dimensions: {
      comprehension: ['compréhension écrite', 'compréhension du contexte et du discours', 'interprétation de textes'],
      writing: ['expression écrite grammaire et ponctuation', 'rédaction et révision de textes', 'structure du paragraphe'],
      instruction_following: ['mode impératif et consignes', 'instructions étape par étape', 'langage directif'],
      translation_localization: ['traduction et localisation', 'équivalence et fidélité en traduction', 'adaptation culturelle du texte'],
      cultural_pragmatics: ['pragmatique et politesse linguistique', 'registre et formules de politesse', 'actes de langage'],
    },
  },
  it: {
    language: 'lingua italiana grammatica e uso',
    academic: ['materiale didattico università', 'manuale di insegnamento'],
    dimensions: {
      comprehension: ['comprensione del testo scritto', 'comprensione del contesto e del discorso', 'interpretazione dei testi'],
      writing: ['produzione scritta grammatica e punteggiatura', 'scrittura e revisione dei testi', 'struttura del paragrafo'],
      instruction_following: ['modo imperativo e istruzioni', 'istruzioni passo dopo passo', 'linguaggio direttivo'],
      translation_localization: ['traduzione e localizzazione', 'equivalenza e fedeltà nella traduzione', 'adattamento culturale del testo'],
      cultural_pragmatics: ['pragmatica e cortesia linguistica', 'registro e formule di cortesia', 'atti linguistici'],
    },
  },
  ja: {
    language: '日本語 文法と用法',
    academic: ['大学 教材', '日本語教育 教科書'],
    dimensions: {
      comprehension: ['読解', '文脈と談話の理解', '文章の解釈'],
      writing: ['作文 文法と句読点', '文章の推敲と添削', '段落の構成'],
      instruction_following: ['命令形と指示表現', '手順の説明', '指示的な言語表現'],
      translation_localization: ['翻訳とローカライズ', '翻訳の等価性と忠実性', 'テキストの文化的適応'],
      cultural_pragmatics: ['語用論と敬語', '待遇表現と言葉遣い', '発話行為'],
    },
  },
  ko: {
    language: '한국어 문법과 용법',
    academic: ['대학 교재', '한국어 교육 교재'],
    dimensions: {
      comprehension: ['읽기 이해', '문맥과 담화 이해', '텍스트 해석'],
      writing: ['쓰기 문법과 문장 부호', '글쓰기와 퇴고', '문단 구성'],
      instruction_following: ['명령문과 지시 표현', '단계별 안내', '지시 화행'],
      translation_localization: ['번역과 현지화', '번역의 등가성과 충실성', '텍스트의 문화적 적응'],
      cultural_pragmatics: ['화용론과 높임법', '경어법과 말투', '화행'],
    },
  },
  ar: {
    language: 'اللغة العربية النحو والاستعمال',
    academic: ['مواد تعليمية جامعية', 'كتاب تعليم اللغة العربية'],
    dimensions: {
      comprehension: ['الفهم القرائي', 'فهم السياق والخطاب', 'تفسير النصوص'],
      writing: ['التعبير الكتابي النحو وعلامات الترقيم', 'تحرير النصوص ومراجعتها', 'بناء الفقرة'],
      instruction_following: ['صيغة الأمر والتعليمات', 'التعليمات خطوة بخطوة', 'اللغة التوجيهية'],
      translation_localization: ['الترجمة والتوطين', 'التكافؤ والأمانة في الترجمة', 'التكييف الثقافي للنص'],
      cultural_pragmatics: ['التداولية وآداب الخطاب', 'المستوى اللغوي وصيغ المخاطبة', 'أفعال الكلام'],
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
