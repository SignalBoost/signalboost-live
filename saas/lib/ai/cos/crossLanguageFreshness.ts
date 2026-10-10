import { crossLanguageLiveIntent } from './crossLanguageLiveIntent.ts'

type Entry = [string, string]

const entries: Entry[] = [
  ['co powinnam zrobić', 'what should i do'],
  ['co powinienem zrobić', 'what should i do'],
  ['zmieniłam nazwisko', 'i changed name'],
  ['zmieniłem nazwisko', 'i changed name'],
  ['dokumenty', 'documents'],
  ['instytucje', 'institutions'],
  ['urzędy', 'offices'],
  ['przepisy', 'regulations'],
  ['prawo', 'law'],
  ['wiza', 'visa'],
  ['paszport', 'passport'],
  ['obecnie', 'currently'],
  ['aktualnie', 'currently'],
  ['dzisiaj', 'today'],
  ['teraz', 'now'],
  ['kto jest', 'who is'],
  ['jakie', 'which'],
  ['jaki', 'which'],
  ['który', 'which'],
  ['która', 'which'],
  ['które', 'which'],
  ['którzy', 'which'],
  ['czy', 'is'],
  ['qué debo hacer', 'what should i do'],
  ['quién es', 'who is'],
  ['quien es', 'who is'],
  ['cuál es', 'which is'],
  ['cual es', 'which is'],
  ['cuáles', 'which'],
  ['cuales', 'which'],
  ['cuál', 'which'],
  ['cual', 'which'],
  ['documentos', 'documents'],
  ['instituciones', 'institutions'],
  ['regulaciones', 'regulations'],
  ['ley', 'law'],
  ['hoy', 'today'],
  ['ahora', 'now'],
  ['actualmente', 'currently'],
  ['o que devo fazer', 'what should i do'],
  ['quem é', 'who is'],
  ['quem e', 'who is'],
  ['qual é', 'which is'],
  ['qual e', 'which is'],
  ['quais', 'which'],
  ['qual', 'which'],
  // "Capital of" must survive translation so the stable-reference rule recognises it (it routed live before).
  ['capital da', 'capital of'],
  ['capital do', 'capital of'],
  ['capital de', 'capital of'],
  ['capitale della', 'capital of'],
  ['capitale di', 'capital of'],
  ['столица', 'capital of'],
  ['regulamentos', 'regulations'],
  ['lei', 'law'],
  ['hoje', 'today'],
  ['agora', 'now'],
  ['atualmente', 'currently'],
  ['что мне делать', 'what should i do'],
  ['кто сейчас', 'who is currently'],
  ['кто', 'who'],
  ['какой', 'which'],
  ['какая', 'which'],
  ['какие', 'which'],
  ['документы', 'documents'],
  ['учреждения', 'institutions'],
  ['правила', 'rules'],
  ['закон', 'law'],
  ['сегодня', 'today'],
  ['сейчас', 'currently'],
  ['виза', 'visa'],
  ['паспорт', 'passport'],
  ['прямой', 'direct'],
  ['прямые', 'direct'],
  ['рейс', 'flight'],
  ['рейсы', 'flights'],
  ['поезд', 'train'],
  ['поезда', 'trains'],
  // "Last night" is a live window, unlike "yesterday"; these must win over the single-word entries below.
  ['ontem à noite', 'last night'],
  ['ontem a noite', 'last night'],
  ['wczoraj wieczorem', 'last night'],
  ['вчера вечером', 'last night'],
  ['wczoraj', 'yesterday'],
  ['ayer', 'yesterday'],
  ['ontem', 'yesterday'],
  ['вчера', 'yesterday'],
  ['wyjaśnij', 'explain'],
  ['explica', 'explain'],
  ['объясни', 'explain'],
  ['moja', 'my'],
  ['nasza', 'our'],
  ['meu', 'my'],
  ['nosso', 'our'],
  ['мой', 'my'],
  ['наш', 'our'],
  ['kampania', 'campaign'],
  ['campaña', 'campaign'],
  ['campanha', 'campaign'],
  ['кампания', 'campaign'],
]

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const before = '(?<![\\p{L}\\p{M}])'
const after = '(?![\\p{L}\\p{M}])'
const compiled = [...entries]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([from, english]) => [new RegExp(`${before}${escape(from)}${after}`, 'giu'), english] as const)

// ASCII Portuguese/Spanish lookup openers must trigger normalization too. Without this signal,
// "qual e ..." bypassed the stale-world guard entirely because it contains no accented character.
const signal = /[\u00c0-\u024f\u0400-\u04ff]|(?:^|\s)(?:czy|jaki|jakie|który|która|które|którzy|kto|gdzie|cuando|donde|quien|cual|cuál|cuales|cuáles|quanto|quem|qual|quais|hoje|hoy)(?:\s|$|[?,.!])/i

export function englishNormalizedForClassification(input: string) {
  const text = String(input || '')
  if (!text) return text
  // Live-fact intent (who holds/will hold an office, who won an election, results, latest news) is
  // recognised in every supported language and placed first, so start-anchored English rules see it.
  // See crossLanguageLiveIntent.ts for the production defect this closes (2026-10-09).
  const intent = crossLanguageLiveIntent(text)
  if (!signal.test(text)) return intent ? `${intent} ; ${text}` : text
  const original = text.toLowerCase().replace(/[¿¡]/g, ' ')
  let out = original
  for (const [pattern, english] of compiled) out = out.replace(pattern, english)
  return `${intent ? `${intent} ; ` : ''}${out} ${original}`.replace(/\s+/g, ' ').trim()
}

// Function words of the supported non-English Latin-script languages that are not English words.
const NON_ENGLISH_FUNCTION_WORD = new RegExp(`(?<![\\p{L}\\p{M}])(?:${[
  // Portuguese
  'quem', 'qual', 'quais', 'quanto', 'quando', 'onde', 'como', 'est[áa]', 's[ãa]o', 'n[ãa]o', 'hoje', 'vai', 'uma', 'em', 'sobre', 'para', 'isso', 'escreva', 'explique', 'resuma',
  // Spanish
  'qui[eé]n', 'cu[áa]l', 'd[óo]nde', 'c[óo]mo', 'qu[ée]', 'hoy', 'el', 'los', 'las', 'del', 'escribe', 'explica',
  // French
  'quel(?:le)?s?', "qu['’]", "c['’]est", 'est-ce', 'o[ùu]', 'combien', 'pourquoi', 'le', 'les', 'des', 'du', 'une', 'est', 'il', 'elle', "aujourd['’]hui", 'explique', '[ée]cris',
  // Italian
  'chi', 'che', 'qual[eè]', 'quali', 'dove', 'perch[ée]', 'gli', 'della', 'dei', 'del', 'sono', 'oggi', 'spiega', 'scrivi', 'riassumi',
  // German
  'wer', 'wie', 'warum', 'wann', 'ist', 'sind', 'nicht', 'der', 'das', 'und', 'ein', 'eine', 'noch', 'heute', 'es', 'erkl[äa]re', 'schreibe',
  // Polish
  'kto', 'czy', 'jak', 'gdzie', 'kiedy', 'dlaczego', 'jest', 'ile', 'nie', 'si[ęe]', 'napisz', 'wyja[śs]nij',
].join('|')})(?![\\p{L}\\p{M}])`, 'iu')

/**
 * True when the prompt is probably not English: the reply language says so, the text carries non-ASCII letters,
 * or it uses function words of another supported language. Used to decide when the word rules alone cannot be
 * trusted to recognise a live-fact question (2026-10-09).
 */
export function mayBeNonEnglish(input: string, language?: string | null): boolean {
  const lang = String(language || '').trim().toLowerCase()
  if (lang && !lang.startsWith('en')) return true
  const text = String(input || '')
  return /[^\u0000-\u007f]/.test(text.replace(/[\u2018\u2019\u201c\u201d\u2013\u2014\u2026]/g, '')) || NON_ENGLISH_FUNCTION_WORD.test(text)
}
