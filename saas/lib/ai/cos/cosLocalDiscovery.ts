import type { FreshEvidenceSource } from './cosFreshGrounding.ts'

const DISCOVERY_INTENT = /^\s*(?:are\s+there|is\s+there|any\b|find\b|show\s+me|where\s+(?:can|could|should)\s+i|recommend\b|suggest\b|what\s+(?:are|is)|which\b)/i
const PLACE_CATEGORY = /\b(?:restaurant|restaurants|bar|bars|pub|pubs|club|clubs|nightclub|nightclubs|lounge|lounges|cafe|cafes|coffee\s+shop|coffee\s+shops|hotel|hotels|hostel|hostels|gym|gyms|store|stores|shop|shops|market|markets|salon|salons|spa|spas|venue|venues|cinema|cinemas|theater|theaters|theatre|theatres|museum|museums|park|parks|pharmacy|pharmacies|hospital|hospitals|clinic|clinics|school|schools|bakery|bakeries|dance|dancing|salsa|bachata|kizomba|nightlife|live\s+music)\b/i
const LOCALITY_CUE = /\b(?:in|near|around|nearby|close\s+to|within)\b/i
const QUERY_STOPWORDS = new Set([
  'are','there','is','any','find','show','me','where','can','could','should','i','recommend','suggest','what','which',
  'in','near','around','nearby','close','to','within','the','a','an','some','for','of','at','current','latest','official',
  'authoritative','independent','verification','as','today','now','clubs','club','bars','bar','restaurants','restaurant',
  'hotels','hotel','shops','shop','stores','store','venues','venue','places','place',
])

function normalized(input: string): string {
  return String(input || '').replace(/\s+/g, ' ').trim()
}

export function isLocalPlaceDiscoveryQuery(input: string): boolean {
  const text = normalized(input)
  if (!text || !PLACE_CATEGORY.test(text)) return false
  if (DISCOVERY_INTENT.test(text) && LOCALITY_CUE.test(text)) return true
  // Terse local-search phrasing such as "salsa clubs Paramaribo" or "restaurants Warsaw".
  return text.split(/\s+/).length <= 8 && /\p{Lu}[\p{L}\p{M}'’.-]{2,}/u.test(text)
}

function terms(input: string): string[] {
  return [...new Set(normalized(input)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map(value => value.trim())
    .filter(value => value.length >= 3 && !QUERY_STOPWORDS.has(value)))]
}

function sourceScore(source: FreshEvidenceSource, queryTerms: string[]): number {
  const haystack = `${source.title} ${source.snippet} ${source.url}`.toLowerCase()
  return queryTerms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0)
}

function cleanSnippet(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 220)
}

function intro(language: string, yesNo: boolean): string {
  const key = String(language || 'en').toLowerCase()
  if (key === 'es') return yesNo ? 'Sí. Encontré resultados locales actuales relevantes:' : 'Encontré estos resultados locales actuales:'
  if (key === 'pt' || key === 'pt-br') return yesNo ? 'Sim. Encontrei resultados locais atuais relevantes:' : 'Encontrei estes resultados locais atuais:'
  if (key === 'pl') return yesNo ? 'Tak. Znalazłem aktualne, pasujące wyniki lokalne:' : 'Znalazłem te aktualne wyniki lokalne:'
  if (key === 'ru') return yesNo ? 'Да. Я нашёл актуальные местные результаты по вашему запросу:' : 'Я нашёл следующие актуальные местные результаты:'
  return yesNo ? 'Yes. I found current local results relevant to your request:' : 'I found these current local results:'
}

export type LocalDiscoveryResolution = {
  reply: string
  sources: FreshEvidenceSource[]
}

/**
 * Resolve bounded local discovery directly from server-retrieved evidence. This path never invents
 * a business, opening hour, address, rating, or availability: it only exposes titles/snippets that
 * already exist in the live evidence set and renders citations server-side.
 */
export function resolveLocalPlaceDiscovery(
  input: string,
  sources: FreshEvidenceSource[],
  language = 'en',
): LocalDiscoveryResolution | null {
  if (!isLocalPlaceDiscoveryQuery(input) || !sources.length) return null
  const queryTerms = terms(input)
  const ranked = sources
    .map(source => ({ source, score: sourceScore(source, queryTerms) }))
    .filter(entry => entry.score >= Math.min(2, Math.max(1, queryTerms.length)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(entry => entry.source)

  if (!ranked.length) return null
  const yesNo = /^\s*(?:are\s+there|is\s+there|any\b)/i.test(input)
  const lines = ranked.map(source => {
    const detail = cleanSnippet(source.snippet)
    return `- ${source.title}${detail ? ` — ${detail}` : ''} [${source.id}] (${source.url})`
  })
  return { reply: `${intro(language, yesNo)}\n${lines.join('\n')}`, sources: ranked }
}
