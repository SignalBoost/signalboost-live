/**
 * Whether a language A-range reply is original prose written in the target language.
 *
 * The rubric in `cosUniversityLanguageARange.ts` checks that required terms appear, that forbidden
 * claims do not, that sections and numbered actions are present, and that one target-language
 * marker matched somewhere in the text. Nothing checked that the reply was WRITTEN in the target
 * language, so two things passed that should not:
 *
 *   - A bag of the rubric's own keywords. The repository's own regression built a passing Polish
 *     reply as `requiredGroups.map(group => group[0]).join(' ')` plus one sentence, and it passed.
 *   - English prose with the localized terms quoted inside it. Every required group matched, and
 *     `LANGUAGE_MARKERS` fired on a single accented character or one borrowed noun.
 *
 * Both defeat the purpose: five-language competence cannot be evidenced by keyword coverage. This
 * module adds three deterministic host-side checks — no model, no network, no stored rubric:
 *
 *   1. Prose. The reply must be sentences, not a term list.
 *   2. Dominance. Target-language function words must outweigh every other platform language.
 *   3. Originality. The reply must not be a near-verbatim copy of the packet it was given.
 *
 * Function words are used rather than content words because content words are exactly what the
 * rubric already supplies to the learner. A learner cannot borrow `w`, `się`, `które` from a term
 * list; they only appear when someone writes sentences.
 */

import { COS_PLATFORM_LANGUAGES, type CosPlatformLanguage } from './cosUniversityLanguages.ts'

export const COS_UNIVERSITY_LANGUAGE_AUTHENTICITY_VERSION = 'university-language-authenticity-v1'

/** Minimum share of tokens that must be target-language function words. */
export const MINIMUM_TARGET_FUNCTION_WORD_DENSITY = 0.06
/** Minimum sentences of real length, so a term list cannot satisfy the density check. */
export const MINIMUM_PROSE_SENTENCES = 3
export const MINIMUM_PROSE_SENTENCE_TOKENS = 6
/** Share of the reply's 8-word shingles that may also appear in the supplied packet. */
export const MAXIMUM_PACKET_SHINGLE_OVERLAP = 0.5
const SHINGLE = 8

/**
 * Closed-class words. Chosen to discriminate between the five platform languages rather than to be
 * exhaustive: Spanish and Portuguese share most function words, so each list keeps the forms the
 * other does not use (`el/los/las/una` against `o/os/as/uma/do/da`).
 */
const FUNCTION_WORDS: Record<CosPlatformLanguage, readonly string[]> = Object.freeze({
  en: ['the', 'and', 'of', 'to', 'is', 'are', 'that', 'with', 'this', 'for', 'not', 'but', 'has',
    'have', 'been', 'which', 'from', 'they', 'while', 'because', 'until', 'there', 'these', 'its'],
  es: ['el', 'los', 'las', 'una', 'del', 'está', 'están', 'que', 'con', 'pero', 'también', 'según',
    'sin', 'porque', 'aunque', 'hasta', 'sus', 'esta', 'este', 'estos', 'ya', 'donde'],
  pt: ['os', 'as', 'uma', 'do', 'da', 'dos', 'das', 'está', 'estão', 'com', 'mas', 'também',
    'segundo', 'sem', 'porque', 'embora', 'até', 'seus', 'esta', 'este', 'ainda', 'onde', 'não'],
  pl: ['w', 'na', 'nie', 'że', 'do', 'z', 'jest', 'są', 'się', 'to', 'od', 'dla', 'przez', 'po',
    'ale', 'oraz', 'który', 'która', 'które', 'przy', 'jako', 'już', 'tylko', 'zostało'],
  ru: ['и', 'в', 'не', 'что', 'на', 'с', 'по', 'для', 'это', 'как', 'из', 'но', 'при', 'же',
    'есть', 'был', 'была', 'будет', 'к', 'от', 'ещё', 'только', 'который', 'которые'],
})

/**
 * Orthography that one platform language uses and its nearest neighbour does not. Counted alongside
 * function words so a short reply is still separable, and so Spanish cannot be handed in for
 * Portuguese on shared vocabulary alone.
 */
const ORTHOGRAPHY: Record<CosPlatformLanguage, RegExp | null> = Object.freeze({
  en: null,
  es: /[ñ¿¡]/g,
  pt: /(?:ção|ções|ã|õ|ç|nh|lh)/g,
  pl: /[ąćęłńśźż]/g,
  ru: /[а-яё]/g,
})

const PLATFORM_LANGUAGES: readonly CosPlatformLanguage[] = COS_PLATFORM_LANGUAGES.map(item => item.id)

function tokens(value: string): string[] {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Sentences long enough to be prose. A comma-separated term list produces none. */
function proseSentences(value: string): string[] {
  return String(value ?? '')
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map(part => part.trim())
    .filter(part => tokens(part).length >= MINIMUM_PROSE_SENTENCE_TOKENS)
}

function shingles(value: string): Set<string> {
  const list = tokens(value)
  const set = new Set<string>()
  for (let index = 0; index + SHINGLE <= list.length; index += 1) {
    set.add(list.slice(index, index + SHINGLE).join(' '))
  }
  return set
}

/**
 * Share of tokens that are either a function word of the language or carry its orthography. A token
 * counts once however many signals it carries, so the value stays a share and one long Cyrillic
 * word cannot outweigh a sentence.
 */
export function languageSignalDensity(reply: string, language: CosPlatformLanguage): number {
  const list = tokens(reply)
  if (!list.length) return 0
  const closed = new Set(FUNCTION_WORDS[language])
  const pattern = ORTHOGRAPHY[language]
  const hits = list.filter(token => {
    if (closed.has(token)) return true
    if (!pattern) return false
    pattern.lastIndex = 0
    return pattern.test(token)
  }).length
  return hits / list.length
}

/** Share of the reply's word shingles that also occur in the supplied packet. */
export function packetShingleOverlap(reply: string, packet: string): number {
  const replyShingles = shingles(reply)
  if (!replyShingles.size) return 0
  const packetShingles = shingles(packet)
  if (!packetShingles.size) return 0
  let shared = 0
  for (const shingle of replyShingles) if (packetShingles.has(shingle)) shared += 1
  return shared / replyShingles.size
}

export type CosUniversityLanguageAuthenticityInput = Readonly<{
  reply: string
  /** The packet the learner was given. Copying it back is not evidence of writing ability. */
  packet: string
  targetLanguage: CosPlatformLanguage
}>

/**
 * Reasons the reply is not original target-language prose. Empty means it is. Reason strings follow
 * the existing rubric convention: stable, public-safe, and free of hidden rubric detail.
 */
export function cosUniversityLanguageAuthenticityReasons(
  input: CosUniversityLanguageAuthenticityInput,
): string[] {
  const reasons: string[] = []
  const reply = String(input.reply ?? '')
  if (!tokens(reply).length) return ['authenticity_empty_reply']

  if (proseSentences(reply).length < MINIMUM_PROSE_SENTENCES) {
    reasons.push('target_language_prose_missing')
  }

  const target = languageSignalDensity(reply, input.targetLanguage)
  if (target < MINIMUM_TARGET_FUNCTION_WORD_DENSITY) {
    reasons.push(`target_language_density_insufficient:${input.targetLanguage}`)
  }
  // Only a language that is strictly stronger than the target is evidence of the wrong language.
  // Ties at zero mean the reply carries no language signal at all, which the density check reports.
  let strongest: { language: CosPlatformLanguage; density: number } | null = null
  for (const language of PLATFORM_LANGUAGES) {
    if (language === input.targetLanguage) continue
    const density = languageSignalDensity(reply, language)
    if (!strongest || density > strongest.density) strongest = { language, density }
  }
  if (strongest && strongest.density > target) {
    reasons.push(`dominant_language_not_target:${strongest.language}`)
  }

  if (packetShingleOverlap(reply, String(input.packet ?? '')) > MAXIMUM_PACKET_SHINGLE_OVERLAP) {
    reasons.push('supplied_packet_copied')
  }
  return reasons
}
