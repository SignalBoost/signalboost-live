import { createHash } from 'node:crypto'
import {
  isCosUniversityVerifiedProductionSource,
  type CosUniversityARangeProvenance,
  type CosUniversityARangeStage,
} from './cosUniversityARange.ts'
import {
  COS_PLATFORM_LANGUAGES,
  type CosPlatformLanguage,
  type CosPlatformLanguageDimension,
} from './cosUniversityLanguages.ts'

export const COS_UNIVERSITY_LANGUAGE_A_RANGE_PROFILE = 'cos_university_language_a_range_v1'
export const COS_UNIVERSITY_LANGUAGE_A_RANGE_SCORER = 'university-language-a-range-host-scorer-v1'
export const COS_UNIVERSITY_LANGUAGE_A_RANGE_MINIMUM_DISTINCT_PASSES = 2
export const COS_UNIVERSITY_LANGUAGE_DIMENSIONS: readonly CosPlatformLanguageDimension[] = [
  'comprehension',
  'writing',
  'instruction_following',
  'translation_localization',
  'cultural_pragmatics',
]

export type CosUniversityLanguageARangeStage = CosUniversityARangeStage
export type CosUniversityLanguageARangeTarget =
  | { stage: 'cross_domain_transfer'; language: CosPlatformLanguage; dimension: CosPlatformLanguageDimension }
  | { stage: 'capstone'; language: CosPlatformLanguage; dimension: null }

export type CosUniversityLanguageARangeRunEvidence = {
  stage: CosUniversityLanguageARangeStage
  language: CosPlatformLanguage
  dimension: CosPlatformLanguageDimension | null
  passed: boolean
  variantHash: string
  observedAt: string
}

export type CosUniversityLanguageARangeRubric = Readonly<{
  requiredGroups: readonly (readonly string[])[]
  forbiddenTerms?: readonly string[]
  requiredSections?: readonly string[]
  numberedActions?: number
  targetLanguage: CosPlatformLanguage
  maxWords: number
}>

export type CosUniversityLanguageARangeExam = Readonly<{
  profile: typeof COS_UNIVERSITY_LANGUAGE_A_RANGE_PROFILE
  scorerVersion: typeof COS_UNIVERSITY_LANGUAGE_A_RANGE_SCORER
  seed: string
  stage: Extract<CosUniversityLanguageARangeStage, 'cross_domain_transfer' | 'capstone'>
  language: CosPlatformLanguage
  dimension: CosPlatformLanguageDimension | null
  project: string
  prompt: string
  rubric: CosUniversityLanguageARangeRubric
  manifestHash: string
}>

export type CosUniversityLanguageARangeScore = { passed: boolean; reasons: string[] }

const LANGUAGE_PRODUCTION_SOURCE = /^(?:production_verified):language:(en|es|pt|pl|ru):(comprehension|writing|instruction_following|translation_localization|cultural_pragmatics):([a-z0-9][a-z0-9_.:/-]{2,118})$/i

const LANGUAGE_MARKERS: Record<CosPlatformLanguage, RegExp> = {
  en: /\b(?:the|please|is|are|will|project|deployment|security|regulatory|thank)\b/i,
  es: /(?:[ñáéíóúü¿¡]|\b(?:por favor|gracias|proyecto|despliegue|seguridad|regulatori\w*|desconocid\w*)\b)/i,
  pt: /(?:[ãõçáéíóúâêô]|\b(?:por favor|obrigad\w*|projeto|implantação|segurança|regulatóri\w*|desconhecid\w*)\b)/i,
  pl: /(?:[ąćęłńóśźż]|\b(?:proszę|dziękuj\w*|projekt|wdrożeni\w*|bezpieczeństw\w*|regulacyj\w*|nieznan\w*)\b)/i,
  ru: /[А-Яа-яЁё]{3,}/,
}

const DOMAIN_GROUPS: Record<CosPlatformLanguage, {
  security: readonly string[]
  regulation: readonly string[]
  uncertainty: readonly string[]
  finance: readonly string[]
  please: readonly string[]
  thanks: readonly string[]
}> = {
  en: {
    security: ['security', 'access control'], regulation: ['regulatory', 'clearance', 'compliance'],
    uncertainty: ['unknown', 'unverified', 'not verified', 'unresolved'], finance: ['budget', 'cost', 'financial'],
    please: ['please', 'could you', 'would you'], thanks: ['thank'],
  },
  es: {
    security: ['seguridad', 'control de acceso'], regulation: ['regulator', 'autorización', 'cumplimiento'],
    uncertainty: ['desconocid', 'no verific', 'sin verificar', 'pendiente'], finance: ['presupuesto', 'coste', 'costo', 'financier'],
    please: ['por favor', 'podría', 'podrías'], thanks: ['gracias', 'agradez'],
  },
  pt: {
    security: ['segurança', 'controle de acesso'], regulation: ['regulat', 'autorização', 'conformidade'],
    uncertainty: ['desconhecid', 'não verific', 'sem verificar', 'pendente'], finance: ['orçamento', 'custo', 'financeir'],
    please: ['por favor', 'poderia'], thanks: ['obrigad', 'agradeç'],
  },
  pl: {
    security: ['bezpieczeń', 'kontrol dostępu'], regulation: ['regulacyj', 'zgodnoś', 'zezwoleni'],
    uncertainty: ['nieznan', 'niezweryfik', 'nierozstrzygnię', 'oczekuj'], finance: ['budżet', 'koszt', 'finans'],
    please: ['proszę', 'czy możesz', 'czy mogliby'], thanks: ['dziękuj'],
  },
  ru: {
    security: ['безопасн', 'контрол доступа'], regulation: ['регулятор', 'соответств', 'разрешен'],
    uncertainty: ['неизвест', 'не провер', 'не подтвержд', 'нереш'], finance: ['бюджет', 'стоимост', 'финанс'],
    please: ['пожалуйста', 'можете', 'могли бы'], thanks: ['спасибо', 'благодар'],
  },
}

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function digest(seed: string, label: string): Buffer {
  return createHash('sha256').update(`${seed}:${label}`).digest()
}

function choose<T>(seed: string, label: string, values: readonly T[]): T {
  return values[digest(seed, label).readUInt32BE(0) % values.length]
}

function integer(seed: string, label: string, min: number, max: number): number {
  return min + (digest(seed, label).readUInt32BE(0) % (max - min + 1))
}

function manifestHash(input: Omit<CosUniversityLanguageARangeExam, 'manifestHash'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function words(value: string): number {
  return clean(value).match(/\S+/g)?.length ?? 0
}

function hasAny(text: string, terms: readonly string[]): boolean {
  const normalized = clean(text).toLowerCase()
  return terms.some(term => normalized.includes(term.toLowerCase()))
}

function languageTitle(language: CosPlatformLanguage): string {
  return COS_PLATFORM_LANGUAGES.find(item => item.id === language)?.title || language
}

function localizedPacket(language: CosPlatformLanguage, facts: { project: string; checks: number; budget: number; weeks: number }): string {
  const { project, checks, budget, weeks } = facts
  const packets: Record<CosPlatformLanguage, string> = {
    en: `Project ${project} has ${checks} passed release checks and a ${budget}-million budget ceiling. Production deployment is not verified. One access-control item in the security review is unresolved, and local regulatory clearance is not provided. Leadership needs a decision within ${weeks} weeks.`,
    es: `El proyecto ${project} tiene ${checks} verificaciones de lanzamiento aprobadas y un límite presupuestario de ${budget} millones. El despliegue en Producción no está verificado. Un punto de control de acceso de la revisión de seguridad sigue pendiente y no se ha aportado la autorización regulatoria local. La dirección necesita una decisión en ${weeks} semanas.`,
    pt: `O projeto ${project} tem ${checks} verificações de lançamento aprovadas e um limite de orçamento de ${budget} milhões. A implantação em Produção não foi verificada. Um item de controle de acesso da revisão de segurança continua pendente e a autorização regulatória local não foi fornecida. A liderança precisa de uma decisão em ${weeks} semanas.`,
    pl: `Projekt ${project} ma ${checks} zaliczonych kontroli wydania i limit budżetu ${budget} milionów. Wdrożenie produkcyjne nie zostało zweryfikowane. Jedna kwestia kontroli dostępu w przeglądzie bezpieczeństwa pozostaje nierozstrzygnięta, a lokalne zezwolenie regulacyjne nie zostało przedstawione. Kierownictwo potrzebuje decyzji w ciągu ${weeks} tygodni.`,
    ru: `Проект ${project} прошёл ${checks} проверок выпуска и имеет бюджетный лимит ${budget} миллионов. Развертывание в Production не подтверждено. Один вопрос контроля доступа в проверке безопасности остаётся нерешённым, а местное регуляторное разрешение не предоставлено. Руководству нужно решение в течение ${weeks} недель.`,
  }
  return packets[language]
}

function translationPacket(language: CosPlatformLanguage, facts: { project: string; checks: number; budget: number; weeks: number }): string {
  const { project, checks, budget, weeks } = facts
  if (language === 'en') {
    return `El proyecto ${project} tiene ${checks} verificaciones de lanzamiento aprobadas y un límite presupuestario de ${budget} millones. El despliegue en Producción no está verificado. Un punto de control de acceso de la revisión de seguridad sigue pendiente y no se ha aportado la autorización regulatoria local. La dirección necesita una decisión en ${weeks} semanas.`
  }
  return `Project ${project} has ${checks} passed release checks and a ${budget}-million budget ceiling. Production deployment is not verified. One access-control item in the security review is unresolved, and local regulatory clearance is not provided. Leadership needs a decision within ${weeks} weeks.`
}

function dimensionInstruction(language: CosPlatformLanguage, dimension: CosPlatformLanguageDimension): string {
  const instructions: Record<CosPlatformLanguage, Record<CosPlatformLanguageDimension, string>> = {
    en: {
      comprehension: 'Answer in English. Separate verified facts from unresolved items and explain why passed checks do not prove Production readiness.',
      writing: 'Write a concise professional executive status update in English. Preserve every material fact and do not invent completion.',
      instruction_following: 'Answer in English with exactly four numbered actions. Each action must name an owner role, an evidence check, and a done condition.',
      translation_localization: 'Translate and localize the packet into natural professional English for an executive audience while preserving every fact, number, and uncertainty.',
      cultural_pragmatics: 'Write a polite professional English message asking the security, regulatory, and operations owners for the missing evidence without blaming them. Include thanks and acknowledge uncertainty.',
    },
    es: {
      comprehension: 'Responde en español. Separa los hechos verificados de los puntos no resueltos y explica por qué las verificaciones aprobadas no demuestran que Producción esté lista.',
      writing: 'Escribe en español una actualización ejecutiva profesional y concisa. Conserva todos los hechos materiales y no inventes que algo esté terminado.',
      instruction_following: 'Responde en español con exactamente cuatro acciones numeradas. Cada acción debe indicar un rol responsable, una verificación de evidencia y una condición de terminado.',
      translation_localization: 'Traduce y adapta el paquete a un español profesional y natural para una audiencia ejecutiva, conservando todos los hechos, números e incertidumbres.',
      cultural_pragmatics: 'Escribe en español un mensaje profesional y cortés para pedir a los responsables de seguridad, regulación y operaciones la evidencia que falta sin culparlos. Da las gracias y reconoce la incertidumbre.',
    },
    pt: {
      comprehension: 'Responda em português. Separe os fatos verificados dos pontos não resolvidos e explique por que as verificações aprovadas não comprovam que a Produção esteja pronta.',
      writing: 'Escreva em português uma atualização executiva profissional e concisa. Preserve todos os fatos materiais e não invente que algo foi concluído.',
      instruction_following: 'Responda em português com exatamente quatro ações numeradas. Cada ação deve indicar um papel responsável, uma verificação de evidência e uma condição de conclusão.',
      translation_localization: 'Traduza e adapte o pacote para português profissional e natural para um público executivo, preservando todos os fatos, números e incertezas.',
      cultural_pragmatics: 'Escreva em português uma mensagem profissional e cortês pedindo aos responsáveis por segurança, regulação e operações as evidências que faltam sem culpá-los. Agradeça e reconheça a incerteza.',
    },
    pl: {
      comprehension: 'Odpowiedz po polsku. Oddziel fakty zweryfikowane od kwestii nierozstrzygniętych i wyjaśnij, dlaczego zaliczone kontrole nie dowodzą gotowości Produkcji.',
      writing: 'Napisz po polsku zwięzłą, profesjonalną aktualizację dla kierownictwa. Zachowaj wszystkie istotne fakty i nie wymyślaj zakończenia prac.',
      instruction_following: 'Odpowiedz po polsku dokładnie czterema ponumerowanymi działaniami. Każde działanie ma wskazywać rolę odpowiedzialną, kontrolę dowodową i warunek zakończenia.',
      translation_localization: 'Przetłumacz i zlokalizuj pakiet na naturalny, profesjonalny polski dla kierownictwa, zachowując wszystkie fakty, liczby i niepewności.',
      cultural_pragmatics: 'Napisz po polsku uprzejmą, profesjonalną wiadomość z prośbą do osób odpowiedzialnych za bezpieczeństwo, regulacje i operacje o brakujące dowody bez obwiniania. Podziękuj i zaznacz niepewność.',
    },
    ru: {
      comprehension: 'Ответьте по-русски. Отделите проверенные факты от нерешённых вопросов и объясните, почему пройденные проверки не доказывают готовность Production.',
      writing: 'Напишите по-русски краткое профессиональное обновление для руководства. Сохраните все существенные факты и не выдумывайте завершение работ.',
      instruction_following: 'Ответьте по-русски ровно четырьмя нумерованными действиями. В каждом укажите ответственную роль, проверку доказательства и условие завершения.',
      translation_localization: 'Переведите и локализуйте пакет на естественный профессиональный русский для руководства, сохранив все факты, числа и неопределённость.',
      cultural_pragmatics: 'Напишите по-русски вежливое профессиональное сообщение с просьбой к ответственным за безопасность, регулирование и операции предоставить недостающие доказательства без обвинений. Поблагодарите и признайте неопределённость.',
    },
  }
  return instructions[language][dimension]
}

function capstoneInstruction(language: CosPlatformLanguage): string {
  const title = languageTitle(language)
  return `HOST-CONTROLLED ${title.toUpperCase()} INTEGRATED LANGUAGE CAPSTONE. Respond entirely in ${title}. Use exactly these section tokens: [COMPREHENSION], [WRITING], [ACTIONS], [LOCALIZATION], [PRAGMATICS]. In [COMPREHENSION], distinguish verified facts from unknowns. In [WRITING], give an executive status update. In [ACTIONS], give exactly four numbered verification actions. In [LOCALIZATION], restate the decision packet naturally for a local executive audience without changing facts. In [PRAGMATICS], write a courteous request for the missing security, regulatory, operational, and financial evidence. Do not use outside facts or claim Production is live.`
}

export function buildCosUniversityLanguageARangeExam(args: {
  seed: string
  target: CosUniversityLanguageARangeTarget
}): CosUniversityLanguageARangeExam {
  const seed = clean(args.seed)
  if (!/^[0-9a-f-]{16,80}$/i.test(seed)) throw new Error('A stable server-side language A-range exam seed is required.')
  const project = choose(seed, 'project', ['Orion', 'Atlas', 'Lumen', 'Cedar', 'Harbor'] as const)
  const checks = integer(seed, 'checks', 31, 79)
  const budget = integer(seed, 'budget', 8, 27)
  const weeks = integer(seed, 'weeks', 5, 14)
  const packet = localizedPacket(args.target.language, { project, checks, budget, weeks })
  const groups = DOMAIN_GROUPS[args.target.language]
  const commonGroups: (readonly string[])[] = [
    [project],
    [String(checks)],
    [String(budget)],
    [String(weeks)],
    groups.security,
    groups.regulation,
    groups.uncertainty,
    groups.finance,
  ]

  let prompt: string
  let rubric: CosUniversityLanguageARangeRubric
  if (args.target.stage === 'capstone') {
    prompt = `${capstoneInstruction(args.target.language)}\n\nDECISION PACKET:\n${packet}`
    rubric = {
      requiredGroups: [...commonGroups, groups.please, groups.thanks],
      requiredSections: ['[COMPREHENSION]', '[WRITING]', '[ACTIONS]', '[LOCALIZATION]', '[PRAGMATICS]'],
      numberedActions: 4,
      targetLanguage: args.target.language,
      forbiddenTerms: ['production is live', 'deployment succeeded', 'regulatory clearance is complete'],
      maxWords: 900,
    }
  } else {
    const transferPacket = args.target.dimension === 'translation_localization'
      ? translationPacket(args.target.language, { project, checks, budget, weeks })
      : packet
    prompt = `HOST-CONTROLLED CROSS-DOMAIN LANGUAGE TRANSFER EXAM. Use only the packet. ${dimensionInstruction(args.target.language, args.target.dimension)}\n\nPACKET:\n${transferPacket}`
    rubric = {
      requiredGroups: [
        ...commonGroups,
        ...(args.target.dimension === 'cultural_pragmatics' ? [groups.please, groups.thanks] : []),
      ],
      numberedActions: args.target.dimension === 'instruction_following' ? 4 : undefined,
      targetLanguage: args.target.language,
      forbiddenTerms: ['production is live', 'deployment succeeded', 'regulatory clearance is complete'],
      maxWords: args.target.dimension === 'instruction_following' ? 420 : 500,
    }
  }

  const base: Omit<CosUniversityLanguageARangeExam, 'manifestHash'> = {
    profile: COS_UNIVERSITY_LANGUAGE_A_RANGE_PROFILE,
    scorerVersion: COS_UNIVERSITY_LANGUAGE_A_RANGE_SCORER,
    seed,
    stage: args.target.stage,
    language: args.target.language,
    dimension: args.target.dimension,
    project,
    prompt,
    rubric,
  }
  return Object.freeze({ ...base, manifestHash: manifestHash(base) })
}

export function scoreCosUniversityLanguageARangeExam(
  exam: CosUniversityLanguageARangeExam,
  reply: string,
  provenance: CosUniversityARangeProvenance,
): CosUniversityLanguageARangeScore {
  const reasons: string[] = []
  const text = String(reply ?? '')
  const normalized = clean(text).toLowerCase()
  if (!normalized) reasons.push('empty_reply')
  if (provenance.handled !== true) reasons.push('not_handled')
  if (provenance.localReasoning !== true) reasons.push('local_reasoning_not_recorded')
  if (provenance.externalAi === true) reasons.push('external_ai_used')
  if (provenance.semanticCache === true) reasons.push('semantic_cache_used')
  if (!clean(provenance.turnId)) reasons.push('turn_id_missing')
  exam.rubric.requiredGroups.forEach((group, index) => {
    if (!hasAny(text, group)) reasons.push(`required_group_${index + 1}_missing`)
  })
  for (const section of exam.rubric.requiredSections ?? []) {
    if (!text.includes(section)) reasons.push(`section_missing:${section}`)
  }
  for (const forbidden of exam.rubric.forbiddenTerms ?? []) {
    if (normalized.includes(forbidden.toLowerCase())) reasons.push(`forbidden:${forbidden}`)
  }
  if (exam.rubric.numberedActions) {
    const actions = [...text.matchAll(/^\s*(\d+)[.)]\s+/gm)].map(match => Number(match[1]))
    if (actions.length !== exam.rubric.numberedActions || actions.some((value, index) => value !== index + 1)) {
      reasons.push('numbered_action_structure_failed')
    }
  }
  if (!LANGUAGE_MARKERS[exam.rubric.targetLanguage].test(text)) {
    reasons.push(`target_language_not_demonstrated:${exam.rubric.targetLanguage}`)
  }
  if (words(text) > exam.rubric.maxWords) reasons.push('word_limit_exceeded')
  return { passed: reasons.length === 0, reasons }
}

export function parseCosUniversityVerifiedLanguageProductionSource(source: unknown): {
  language: CosPlatformLanguage
  dimension: CosPlatformLanguageDimension
  reference: string
} | null {
  const value = clean(source)
  if (!isCosUniversityVerifiedProductionSource(value)) return null
  const match = LANGUAGE_PRODUCTION_SOURCE.exec(value)
  if (!match) return null
  return {
    language: match[1].toLowerCase() as CosPlatformLanguage,
    dimension: match[2].toLowerCase() as CosPlatformLanguageDimension,
    reference: match[3],
  }
}

export function languageARangeStagePassesSinceLatestFailure(
  rows: CosUniversityLanguageARangeRunEvidence[],
  stage: CosUniversityLanguageARangeStage,
  language: CosPlatformLanguage,
  dimension: CosPlatformLanguageDimension | null,
): number {
  const relevant = rows
    .filter(row => row.stage === stage && row.language === language && row.dimension === dimension && Number.isFinite(Date.parse(row.observedAt)))
    .slice()
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
  let afterFailure: CosUniversityLanguageARangeRunEvidence[] = []
  for (const row of relevant) {
    if (!row.passed) afterFailure = []
    else afterFailure.push(row)
  }
  return new Set(afterFailure.map(row => clean(row.variantHash)).filter(Boolean)).size
}

export function languageARangeStageThresholdMet(
  rows: CosUniversityLanguageARangeRunEvidence[],
  stage: CosUniversityLanguageARangeStage,
  language: CosPlatformLanguage,
  dimension: CosPlatformLanguageDimension | null,
): boolean {
  return languageARangeStagePassesSinceLatestFailure(rows, stage, language, dimension)
    >= COS_UNIVERSITY_LANGUAGE_A_RANGE_MINIMUM_DISTINCT_PASSES
}

export function universityLanguageARangeValidUntil(stage: CosUniversityLanguageARangeStage, observedAt: Date): string {
  const days = stage === 'production_transfer' ? 90 : 120
  return new Date(observedAt.getTime() + days * 86_400_000).toISOString()
}
