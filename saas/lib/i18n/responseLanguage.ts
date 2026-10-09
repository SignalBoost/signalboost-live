import { normalizeSupportedLanguage, type SupportedLanguage } from './supportedLanguages.ts'

export type SupportedResponseLanguage = SupportedLanguage

function normalizedContextLanguage(value: unknown): SupportedResponseLanguage {
  return normalizeSupportedLanguage(value)
}

// Imperative "answer/write/translate" verbs in each platform language, used before a target-language phrase.
const EN_VERB = String.raw`\b(?:answer|respond|reply|write|translate)\b[\s\S]{0,40}\b(?:in|into)\s+`
const PL_VERB = String.raw`\b(?:odpowiedz|napisz|pisz|przetłumacz)\b[\s\S]{0,40}\b`
const ES_VERB = String.raw`\b(?:responde|escribe|traduc[ei])\b[\s\S]{0,40}\b`
const PT_VERB = String.raw`\b(?:responda|escreva|traduza)\b[\s\S]{0,40}\b`
const RU_VERB = String.raw`(?:ответь|напиши|переведи)[\s\S]{0,40}`
const DE_VERB = String.raw`(?<!\p{L})(?:antworte|antworten|antwortest|schreib|schreibe|schreiben|übersetze|übersetzen)(?!\p{L})[\s\S]{0,40}`
const DE_VERB_FINAL = String.raw`(?<!\p{L})(?:antworten|schreiben|übersetzen|übersetzt)(?!\p{L})`
const FR_VERB = String.raw`(?<!\p{L})(?:réponds|répondez|répondre|écris|écrivez|traduis|traduisez)(?!\p{L})[\s\S]{0,40}`
const IT_VERB = String.raw`\b(?:rispondi|rispondimi|risponda|rispondete|scrivi|scrivimi|scriva|traduci|traducimi|traduca)\b[\s\S]{0,40}`
const AR_VERB = String.raw`(?<!\p{L})[وف]?(?:أجب|اجب|أجيبي|أجيبوا|رد|ردّ|ردي|اكتب|اكتبي|اكتبه|اكتبها|ترجم|ترجمي|ترجمه|ترجمها)(?!\p{L})[\s\S]{0,40}`
const JA_VERB = String.raw`[\s\S]{0,4}(?:で)?(?:答え|回答|返答|返事|書いて|書き|翻訳|訳して|お願い)`
const KO_VERB = String.raw`\s*(?:로|으로)?\s*(?:답|대답|응답|작성|써|번역)`

function rx(source: string): RegExp {
  return new RegExp(source, 'iu')
}

/** Phrasings of "answer in <language>" written in every platform language, keyed by target language. */
function overridePatterns(english: string, names: {
  pl: string
  es: string
  pt: string
  ru: string
  de: string
  fr: string
  it: string
  ja: string
  ko: string
  ar: string
}): RegExp[] {
  return [
    rx(`${EN_VERB}${english}\\b`),
    rx(`${PL_VERB}(?:${names.pl})\\b`),
    rx(`${ES_VERB}(?:${names.es})\\b`),
    rx(`${PT_VERB}(?:${names.pt})\\b`),
    rx(`${RU_VERB}(?:${names.ru})`),
    rx(`${DE_VERB}\\b(?:${names.de})\\b`),
    rx(`\\b(?:${names.de})\\b[\\s\\S]{0,40}${DE_VERB_FINAL}`),
    rx(`${FR_VERB}\\b(?:${names.fr})\\b`),
    rx(`${IT_VERB}\\b(?:${names.it})\\b`),
    rx(`(?:${names.ja})${JA_VERB}`),
    rx(`(?:${names.ko})${KO_VERB}`),
    rx(`${AR_VERB}(?:${names.ar})`),
  ]
}

const OVERRIDE_RULES: Array<[SupportedResponseLanguage, RegExp[]]> = [
  ['en', overridePatterns('english', {
    pl: 'po angielsku|na angielski', es: 'en ingl[eé]s', pt: 'em ingl[eê]s', ru: 'по-английски|на английском',
    de: 'auf englisch|ins englische', fr: 'en anglais', it: 'in inglese', ja: '英語', ko: '영어', ar: 'بالإنجليزية|بالانجليزية|باللغة الإنجليزية|إلى الإنجليزية',
  })],
  ['pl', overridePatterns('polish', {
    pl: 'po polsku|na polski', es: 'en polaco', pt: 'em polon[eê]s|em polaco', ru: 'по-польски|на польском',
    de: 'auf polnisch|ins polnische', fr: 'en polonais', it: 'in polacco', ja: 'ポーランド語', ko: '폴란드어', ar: 'بالبولندية|باللغة البولندية|إلى البولندية',
  })],
  ['es', overridePatterns('spanish', {
    pl: 'po hiszpańsku|na hiszpański', es: 'en espa[nñ]ol|en castellano', pt: 'em espanhol', ru: 'по-испански|на испанском',
    de: 'auf spanisch|ins spanische', fr: 'en espagnol', it: 'in spagnolo', ja: 'スペイン語', ko: '스페인어', ar: 'بالإسبانية|باللغة الإسبانية|إلى الإسبانية',
  })],
  ['pt', overridePatterns('portuguese', {
    pl: 'po portugalsku|na portugalski', es: 'en portugu[eé]s', pt: 'em portugu[eê]s', ru: 'по-португальски|на португальском',
    de: 'auf portugiesisch|ins portugiesische', fr: 'en portugais', it: 'in portoghese', ja: 'ポルトガル語', ko: '포르투갈어', ar: 'بالبرتغالية|باللغة البرتغالية|إلى البرتغالية',
  })],
  ['ru', overridePatterns('russian', {
    pl: 'po rosyjsku|na rosyjski', es: 'en ruso', pt: 'em russo', ru: 'по-русски|на русском',
    de: 'auf russisch|ins russische', fr: 'en russe', it: 'in russo', ja: 'ロシア語', ko: '러시아어', ar: 'بالروسية|باللغة الروسية|إلى الروسية',
  })],
  ['de', overridePatterns('german', {
    pl: 'po niemiecku|na niemiecki', es: 'en alem[aá]n', pt: 'em alem[aã]o', ru: 'по-немецки|на немецком',
    de: 'auf deutsch|ins deutsche', fr: 'en allemand', it: 'in tedesco', ja: 'ドイツ語', ko: '독일어', ar: 'بالألمانية|باللغة الألمانية|إلى الألمانية',
  })],
  ['fr', overridePatterns('french', {
    pl: 'po francusku|na francuski', es: 'en franc[eé]s', pt: 'em franc[eê]s', ru: 'по-французски|на французском',
    de: 'auf französisch|ins französische', fr: 'en français', it: 'in francese', ja: 'フランス語', ko: '프랑스어', ar: 'بالفرنسية|باللغة الفرنسية|إلى الفرنسية',
  })],
  ['it', overridePatterns('italian', {
    pl: 'po włosku|na włoski', es: 'en italiano', pt: 'em italiano', ru: 'по-итальянски|на итальянском',
    de: 'auf italienisch|ins italienische', fr: 'en italien', it: 'in italiano', ja: 'イタリア語', ko: '이탈리아어', ar: 'بالإيطالية|باللغة الإيطالية|إلى الإيطالية',
  })],
  ['ja', overridePatterns('japanese', {
    pl: 'po japońsku|na japoński', es: 'en japon[eé]s', pt: 'em japon[eê]s', ru: 'по-японски|на японском',
    de: 'auf japanisch|ins japanische', fr: 'en japonais', it: 'in giapponese', ja: '日本語', ko: '일본어', ar: 'باليابانية|باللغة اليابانية|إلى اليابانية',
  })],
  ['ko', overridePatterns('korean', {
    pl: 'po koreańsku|na koreański', es: 'en coreano', pt: 'em coreano', ru: 'по-корейски|на корейском',
    de: 'auf koreanisch|ins koreanische', fr: 'en coréen', it: 'in coreano', ja: '韓国語|朝鮮語', ko: '한국어|한국말', ar: 'بالكورية|باللغة الكورية|إلى الكورية',
  })],
  ['ar', overridePatterns('arabic', {
    pl: 'po arabsku|na arabski', es: 'en [aá]rabe', pt: 'em [aá]rabe', ru: 'по-арабски|на арабском',
    de: 'auf arabisch|ins arabische', fr: 'en arabe', it: 'in arabo', ja: 'アラビア語', ko: '아랍어', ar: 'بالعربية|باللغة العربية|إلى العربية',
  })],
]

function explicitLanguageOverride(prompt: string): SupportedResponseLanguage | null {
  const text = String(prompt || '').toLowerCase()
  for (const [language, patterns] of OVERRIDE_RULES) if (patterns.some(pattern => pattern.test(text))) return language
  return null
}

function scriptCount(text: string, pattern: RegExp): number {
  return (text.match(pattern) || []).length
}

function promptLanguage(prompt: string): SupportedResponseLanguage | null {
  const text = String(prompt || '').trim().toLowerCase()
  if (!text) return null
  if (scriptCount(text, /[\u0400-\u04ff]/g) >= 3) return 'ru'
  // Kana appears only in Japanese; Chinese-only Han text has none and stays unresolved.
  if (scriptCount(text, /[\u3040-\u30ff]/g) >= 2) return 'ja'
  if (scriptCount(text, /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/g) >= 2) return 'ko'
  if (scriptCount(text, /[\u0600-\u06ff]/g) >= 3) return 'ar'

  const tokens = new Set(text.match(/\p{L}+/gu) || [])
  const score = (words: readonly string[]) => words.reduce((total, word) => total + (tokens.has(word) ? 1 : 0), 0)

  let pl = score(['mam','godzin','zabicia','ląduję','ląduje','chcę','chce','wydawać','pieniędzy','przygotuj','ekonomiczny','zwiedzania','między','podaj','środki','transportu','jeśli','jesli','jakaś','jakas','atrakcja','płatna','platna','której','ktorej','warto','pomijać','proszę','prosze','uwzględnij','sobotę','sobote'])
  let es = score(['quiero','tengo','horas','sábado','sabado','llego','aeropuerto','barato','económico','economico','prepara','plan','visitar','transporte','atracción','atraccion','incluye','por','favor'])
  let pt = score(['quero','tenho','horas','sábado','sabado','chego','aeroporto','barato','econômico','economico','prepare','plano','visitar','transporte','atração','atracao','inclua','por','favor'])
  let en = score(['want','have','hours','saturday','arrive','airport','cheap','budget','prepare','plan','visit','transport','attraction','include','please','what','the','is','are','how','from','to','with','for','my','can','way','get','cheapest','city'])
  let de = score(['ich','möchte','moechte','habe','brauche','stunden','samstag','lande','flughafen','günstig','günstigen','besuchen','verkehrsmittel','sehenswürdigkeit','bitte','und','nicht','ist','ein','eine','einen','der','die','mit','für','wie','kann','können','wir','auch','oder','zum','zur'])
  let fr = score(['je','veux','voudrais','heures','samedi','aéroport','économique','visiter','transports','payante','merci','vous','nous','des','du','est','une','avec','pour','dans','sur','comment','quel','quelle','pas','cher','mon','mes','être','peux','pouvez'])
  let it = score(['voglio','vorrei','ho','ore','sabato','arrivo','economica','preparami','visitare','trasporti','mezzi','attrazione','grazie','gli','della','nella','alla','sono','è','che','per','posso','puoi','questo','questa','anche','molto','perché','più','può','già'])

  if (/[ąćęłńóśźż]/u.test(text)) pl += 3
  if (/[¿¡ñ]/u.test(text)) es += 3
  if (/[ãõç]/u.test(text) || /\b(?:ção|ções|não|você)\b/u.test(text)) pt += 3
  if (/[äöüß]/u.test(text)) de += 2
  if (/[ëïîœæ]/u.test(text) || /(?<!\p{L})(?:qu|j|n)['’]\p{L}/u.test(text)) fr += 2

  const ranked: Array<[SupportedResponseLanguage, number]> = [['pl', pl], ['es', es], ['pt', pt], ['en', en], ['de', de], ['fr', fr], ['it', it]]
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
