import { normalizeSupportedLanguage, type SupportedLanguage } from './supportedLanguages.ts'

export type SupportedResponseLanguage = SupportedLanguage

function normalizedContextLanguage(value: unknown): SupportedResponseLanguage {
  return normalizeSupportedLanguage(value)
}

function explicitLanguageOverride(prompt: string): SupportedResponseLanguage | null {
  const text = String(prompt || '').toLowerCase()
  const rules: Array<[SupportedResponseLanguage, RegExp[]]> = [
    ['en', [
      /\b(?:answer|respond|reply|write|translate)\b[\s\S]{0,40}\b(?:in|into)\s+english\b/i,
      /\b(?:odpowiedz|napisz|pisz|przetłumacz)\b[\s\S]{0,40}\b(?:po angielsku|na angielski)\b/i,
      /\b(?:responde|escribe|traduc[ei])\b[\s\S]{0,40}\ben ingl[eé]s\b/i,
      /\b(?:responda|escreva|traduza)\b[\s\S]{0,40}\bem ingl[eê]s\b/i,
      /(?:ответь|напиши|переведи)[\s\S]{0,40}(?:по-английски|на английском)/iu,
    ]],
    ['pl', [
      /\b(?:answer|respond|reply|write|translate)\b[\s\S]{0,40}\b(?:in|into)\s+polish\b/i,
      /\b(?:odpowiedz|napisz|pisz|przetłumacz)\b[\s\S]{0,40}\b(?:po polsku|na polski)\b/i,
    ]],
    ['es', [
      /\b(?:answer|respond|reply|write|translate)\b[\s\S]{0,40}\b(?:in|into)\s+spanish\b/i,
      /\b(?:odpowiedz|napisz|pisz|przetłumacz)\b[\s\S]{0,40}\b(?:po hiszpańsku|na hiszpański)\b/i,
      /\b(?:responde|escribe|traduc[ei])\b[\s\S]{0,40}\ben espa[nñ]ol\b/i,
    ]],
    ['pt', [
      /\b(?:answer|respond|reply|write|translate)\b[\s\S]{0,40}\b(?:in|into)\s+portuguese\b/i,
      /\b(?:odpowiedz|napisz|pisz|przetłumacz)\b[\s\S]{0,40}\b(?:po portugalsku|na portugalski)\b/i,
      /\b(?:responda|escreva|traduza)\b[\s\S]{0,40}\bem portugu[eê]s\b/i,
    ]],
    ['ru', [
      /\b(?:answer|respond|reply|write|translate)\b[\s\S]{0,40}\b(?:in|into)\s+russian\b/i,
      /\b(?:odpowiedz|napisz|pisz|przetłumacz)\b[\s\S]{0,40}\b(?:po rosyjsku|na rosyjski)\b/i,
      /(?:ответь|напиши|переведи)[\s\S]{0,40}(?:по-русски|на русском)/iu,
    ]],
  ]
  for (const [language, patterns] of rules) if (patterns.some(pattern => pattern.test(text))) return language
  return null
}

function promptLanguage(prompt: string): SupportedResponseLanguage | null {
  const text = String(prompt || '').trim().toLowerCase()
  if (!text) return null
  if ((text.match(/[\u0400-\u04ff]/g) || []).length >= 3) return 'ru'

  const tokens = new Set(text.match(/\p{L}+/gu) || [])
  const score = (words: readonly string[]) => words.reduce((total, word) => total + (tokens.has(word) ? 1 : 0), 0)

  let pl = score(['mam','godzin','zabicia','ląduję','ląduje','chcę','chce','wydawać','pieniędzy','przygotuj','ekonomiczny','zwiedzania','między','podaj','środki','transportu','jeśli','jesli','jakaś','jakas','atrakcja','płatna','platna','której','ktorej','warto','pomijać','proszę','prosze','uwzględnij','sobotę','sobote'])
  let es = score(['quiero','tengo','horas','sábado','sabado','llego','aeropuerto','barato','económico','economico','prepara','plan','visitar','transporte','atracción','atraccion','incluye','por','favor'])
  let pt = score(['quero','tenho','horas','sábado','sabado','chego','aeroporto','barato','econômico','economico','prepare','plano','visitar','transporte','atração','atracao','inclua','por','favor'])
  let en = score(['want','have','hours','saturday','arrive','airport','cheap','budget','prepare','plan','visit','transport','attraction','include','please'])

  if (/[ąćęłńóśźż]/u.test(text)) pl += 3
  if (/[¿¡ñ]/u.test(text)) es += 3
  if (/[ãõç]/u.test(text) || /\b(?:ção|ções|não|você)\b/u.test(text)) pt += 3

  const ranked: Array<[SupportedResponseLanguage, number]> = [['pl', pl], ['es', es], ['pt', pt], ['en', en]]
  ranked.sort((a, b) => b[1] - a[1])
  const [language, best] = ranked[0]
  const second = ranked[1]?.[1] ?? 0
  return best >= 3 && best >= second + 1 ? language : null
}

/**
 * Response language follows the language the user actually wrote in.
 * UI/session locale is only a fallback for short/ambiguous turns.
 * An explicit user request for a different output language wins over both.
 */
export function resolveResponseLanguage(prompt: string, contextLanguage?: unknown): SupportedResponseLanguage {
  return explicitLanguageOverride(prompt)
    ?? promptLanguage(prompt)
    ?? normalizedContextLanguage(contextLanguage)
}
