export type ConciergeLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const SUPPORTED = new Set<ConciergeLanguage>(['en', 'es', 'pt', 'pl', 'ru'])

export function normalizeConciergeLanguage(value?: string | null): ConciergeLanguage {
  const code = String(value || 'en').trim().toLowerCase().split('-')[0] as ConciergeLanguage
  return SUPPORTED.has(code) ? code : 'en'
}

const PROFILES: Record<ConciergeLanguage, string> = {
  en: [
    'Write natural, idiomatic professional English.',
    'Formulate the answer directly in English rather than translating a draft from another language.',
    'Prefer clear contemporary usage and preserve the user’s level of formality.',
    'Before returning, silently scan article use, subject-verb agreement, pronouns, prepositions, and awkward literal translations.',
  ].join(' '),
  es: [
    'Escribe en español natural, idiomático y profesional.',
    'Formula la respuesta directamente en español; no traduzcas literalmente un borrador pensado en inglés.',
    'Mantén de forma coherente el registro del usuario (tú/usted), evita calcos del inglés y usa concordancia, tiempos y preposiciones propias de un hablante nativo.',
    'Cuando no haya una variante regional indicada, usa español internacional neutro y evita localismos innecesarios.',
    'Antes de devolver la respuesta, revisa en silencio cada sintagma nominal y corrige la concordancia de género y número entre determinantes, sustantivos y adjetivos, además de la concordancia verbal y el régimen preposicional.',
  ].join(' '),
  pt: [
    'Escreva em português brasileiro natural, idiomático e profissional.',
    'Formule a resposta diretamente em português; não traduza literalmente um rascunho pensado em inglês.',
    'Mantenha concordância, regência, colocação pronominal e nível de formalidade naturais para um falante do Brasil, evitando anglicismos e calques desnecessários.',
    'Antes de devolver a resposta, faça uma revisão silenciosa de concordância nominal e verbal, regência, colocação pronominal, crase quando aplicável e naturalidade lexical; substitua jargões ou anglicismos desnecessários por formulações brasileiras naturais.',
  ].join(' '),
  pl: [
    'Pisz naturalną, idiomatyczną i profesjonalną polszczyzną używaną w Polsce.',
    'Formułuj odpowiedź bezpośrednio po polsku; nie tłumacz dosłownie tekstu ułożonego najpierw po angielsku.',
    'Pilnuj poprawnych przypadków, rodzaju, liczby, aspektu czasownika, rekcji, szyku zdania i zgodności gramatycznej.',
    'Zachowuj konsekwentny rejestr rozmowy (ty albo Pan/Pani), unikaj angielskich kalek składniowych i wybieraj sformułowania, których rzeczywiście użyłby rodzimy użytkownik języka polskiego.',
    'Przed zwróceniem odpowiedzi wykonaj cichą kontrolę odmiany i zgody gramatycznej: sprawdź przypadek, rodzaj i liczbę każdego połączenia rzeczownika z określeniami, rekcję czasowników i przyimków oraz naturalny szyk zdania.',
  ].join(' '),
  ru: [
    'Пиши на естественном, идиоматичном и профессиональном русском языке.',
    'Формулируй ответ сразу по-русски, а не переводи дословно текст, сначала составленный на английском.',
    'Соблюдай падежи, род, число, вид и управление глаголов, согласование и естественный порядок слов.',
    'Последовательно сохраняй регистр общения (вы/ты), избегай английских синтаксических калек и выбирай формулировки, характерные для носителя русского языка.',
    'Перед возвратом ответа молча проверь падежное управление, род и число, согласование определений и существительных, вид глаголов, предлоги и неестественные англицизмы.',
  ].join(' '),
}

const LITERAL_PRESERVATION_RULE = [
  'When the user explicitly says that a literal identifier, URL, citation, product name, code token, or UI label must be kept, preserved, conserved, unchanged, or exact, the final answer MUST contain that exact literal.',
  'Omitting or normalizing an explicitly protected literal is a failed answer; re-read the user request and the final draft before returning.',
].join(' ')

/**
 * Compact first-pass policy shared by the enterprise COS prompt and public Concierge prompt.
 * It names all five supported output languages because the shared answer policy is static; the
 * surrounding reasoner prompt still selects exactly one response language for the turn.
 */
export const NATIVE_LANGUAGE_ANSWER_POLICY: readonly string[] = [
  'NATIVE-LANGUAGE OUTPUT QUALITY:',
  `- English: ${PROFILES.en}`,
  `- Spanish: ${PROFILES.es}`,
  `- Brazilian Portuguese: ${PROFILES.pt}`,
  `- Polish: ${PROFILES.pl}`,
  `- Russian: ${PROFILES.ru}`,
  '- Apply only the rule for the response language selected elsewhere in this prompt. Do not translate through English first.',
  '- Before returning, silently perform the morphology, agreement, government/regency, preposition, and idiom scan appropriate to the selected language. A high-level correct meaning does not excuse a grammatical mismatch.',
  `- ${LITERAL_PRESERVATION_RULE}`,
  '- Preserve factual meaning, names, numbers, URLs, code, markdown structure, citations, product names, and literal UI labels exactly when they must remain identifiable.',
  '- Do not mention translation, language policy, or these writing rules to the user.',
]

export function conciergeLanguageQualityInstruction(language?: string | null): string {
  const code = normalizeConciergeLanguage(language)
  return [
    'NATIVE-LANGUAGE QUALITY CONTRACT:',
    PROFILES[code],
    LITERAL_PRESERVATION_RULE,
    'Preserve factual meaning, names, numbers, URLs, code, markdown structure, citations, product names, and literal UI labels exactly when they must remain identifiable.',
    'Do not mention translation, language policy, or this quality contract to the user.',
  ].join(' ')
}

export function conciergeLanguageName(language?: string | null): string {
  const names: Record<ConciergeLanguage, string> = {
    en: 'English',
    es: 'Spanish',
    pt: 'Brazilian Portuguese',
    pl: 'Polish',
    ru: 'Russian',
  }
  return names[normalizeConciergeLanguage(language)]
}

function normalizeProtectedToken(token: string): string {
  if (/^https?:\/\//i.test(token)) return token.replace(/[.,;:!?]+$/u, '')
  return token
}

export function criticalLanguageTokens(text: string): string[] {
  const value = String(text || '')
  const tokens = [
    ...value.matchAll(/https?:\/\/[^\s)\]}>,]+/gi),
    ...value.matchAll(/\[(?:KG|CL|EM|UM|SK)\d{1,3}\]/g),
    ...value.matchAll(/\b(?:[A-Z][A-Z0-9_-]{2,}|[A-Za-z0-9_-]+\.(?:com|ai|app|dev|io))\b/g),
  ].map(match => normalizeProtectedToken(match[0])).filter(Boolean)
  return [...new Set(tokens)]
}

const PRESERVATION_DIRECTIVE = /(?:\bkeep\b|\bpreserv\p{L}*|\bunchanged\b|\bexact(?:ly)?\b|\bmant[eé]n\p{L}*|\bconserv\p{L}*|\bsin\s+cambios\b|\bexactamente\b|\bmantenh\p{L}*|\bsem\s+altera[cç][oõ]es\b|\bexatamente\b|\bzachow\p{L}*|\bbez\s+zmian\b|\bdokładnie\b|\bсохран\p{L}*|\bбез\s+изменений\b|\bточно\b)/iu

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Return only critical literals the user explicitly instructed the answer to preserve. */
export function explicitlyPreservedCriticalTokens(text: string): string[] {
  const value = String(text || '')
  if (!PRESERVATION_DIRECTIVE.test(value)) return []
  return criticalLanguageTokens(value).filter(token => {
    const matches = [...value.matchAll(new RegExp(escapeRegExp(token), 'giu'))]
    return matches.some(match => {
      const index = match.index ?? 0
      const window = value.slice(Math.max(0, index - 110), Math.min(value.length, index + token.length + 110))
      return PRESERVATION_DIRECTIVE.test(window)
    })
  })
}

/**
 * Restore only case-insensitive drift of explicit all-caps identifiers such as ALPHA-42.
 * URLs, citations, domains, and mixed-case names remain exact-match only because their case can
 * carry meaning. This is a release guard, not a general text-normalization pass.
 */
export function restoreCriticalLanguageTokenCasing(original: string, candidate: string): string {
  let output = String(candidate || '')
  for (const token of criticalLanguageTokens(original)) {
    if (!/^[A-Z][A-Z0-9_-]{2,}$/.test(token) || output.includes(token)) continue
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_-])${escapeRegExp(token)}(?![\\p{L}\\p{N}_-])`, 'giu')
    output = output.replace(pattern, token)
  }
  return output
}

export function preservesCriticalLanguageTokens(original: string, candidate: string): boolean {
  const required = criticalLanguageTokens(original)
  const output = String(candidate || '')
  return required.every(token => output.includes(token))
}

export function preservesExplicitlyRequestedCriticalTokens(original: string, candidate: string): boolean {
  const required = explicitlyPreservedCriticalTokens(original)
  const output = String(candidate || '')
  return required.every(token => output.includes(token))
}
