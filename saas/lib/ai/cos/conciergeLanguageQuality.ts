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
  ].join(' '),
  es: [
    'Escribe en español natural, idiomático y profesional.',
    'Formula la respuesta directamente en español; no traduzcas literalmente un borrador pensado en inglés.',
    'Mantén de forma coherente el registro del usuario (tú/usted), evita calcos del inglés y usa concordancia, tiempos y preposiciones propias de un hablante nativo.',
    'Cuando no haya una variante regional indicada, usa español internacional neutro y evita localismos innecesarios.',
  ].join(' '),
  pt: [
    'Escreva em português brasileiro natural, idiomático e profissional.',
    'Formule a resposta diretamente em português; não traduza literalmente um rascunho pensado em inglês.',
    'Mantenha concordância, regência, colocação pronominal e nível de formalidade naturais para um falante do Brasil, evitando anglicismos e calques desnecessários.',
  ].join(' '),
  pl: [
    'Pisz naturalną, idiomatyczną i profesjonalną polszczyzną używaną w Polsce.',
    'Formułuj odpowiedź bezpośrednio po polsku; nie tłumacz dosłownie tekstu ułożonego najpierw po angielsku.',
    'Pilnuj poprawnych przypadków, rodzaju, liczby, aspektu czasownika, rekcji, szyku zdania i zgodności gramatycznej.',
    'Zachowuj konsekwentny rejestr rozmowy (ty albo Pan/Pani), unikaj angielskich kalek składniowych i wybieraj sformułowania, których rzeczywiście użyłby rodzimy użytkownik języka polskiego.',
  ].join(' '),
  ru: [
    'Пиши на естественном, идиоматичном и профессиональном русском языке.',
    'Формулируй ответ сразу по-русски, а не переводи дословно текст, сначала составленный на английском.',
    'Соблюдай падежи, род, число, вид и управление глаголов, согласование и естественный порядок слов.',
    'Последовательно сохраняй регистр общения (вы/ты), избегай английских синтаксических калек и выбирай формулировки, характерные для носителя русского языка.',
  ].join(' '),
}

export function conciergeLanguageQualityInstruction(language?: string | null): string {
  const code = normalizeConciergeLanguage(language)
  return [
    'NATIVE-LANGUAGE QUALITY CONTRACT:',
    PROFILES[code],
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

export function criticalLanguageTokens(text: string): string[] {
  const value = String(text || '')
  const tokens = [
    ...value.matchAll(/https?:\/\/[^\s)\]}>,]+/gi),
    ...value.matchAll(/\[(?:KG|CL|EM|UM|SK)\d{1,3}\]/g),
    ...value.matchAll(/\b(?:[A-Z][A-Z0-9_-]{2,}|[A-Za-z0-9_-]+\.(?:com|ai|app|dev|io))\b/g),
  ].map(match => match[0])
  return [...new Set(tokens)]
}

export function preservesCriticalLanguageTokens(original: string, candidate: string): boolean {
  const required = criticalLanguageTokens(original)
  const output = String(candidate || '')
  return required.every(token => output.includes(token))
}
