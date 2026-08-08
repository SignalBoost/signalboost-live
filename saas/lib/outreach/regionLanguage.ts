// saas/lib/outreach/regionLanguage.ts
// Region -> communication language, per the standing outreach directive:
//   Brazil/Portugal -> Portuguese (pt), Spanish-speaking markets -> Spanish (es),
//   Poland -> Polish (pl), Russia -> Russian (ru), everywhere else -> English (en).
// Detection is deterministic and leans on the target's OWN site content (script +
// country signals), so a generically-named firm is still classified by the language
// its website is actually written in. No model call, no guessing a country we can't see.

export type OutreachLang = 'pt' | 'es' | 'pl' | 'ru' | 'en'

// Spanish-speaking Latin America (Brazil is handled separately as pt).
const LATAM_TLDS = ['.mx', '.ar', '.co', '.cl', '.pe', '.ve', '.ec', '.gt', '.bo', '.do', '.hn', '.py', '.sv', '.ni', '.cr', '.pa', '.uy', '.pr']
const LATAM_NAMES = ['mexico', 'méxico', 'argentina', 'colombia', 'chile', 'peru', 'perú', 'venezuela', 'ecuador', 'guatemala', 'bolivia', 'republica dominicana', 'república dominicana', 'dominican republic', 'honduras', 'paraguay', 'el salvador', 'nicaragua', 'costa rica', 'panama', 'panamá', 'uruguay', 'puerto rico']

function hasTld(hay: string, tld: string): boolean {
  // match the ccTLD as a host suffix or followed by /, :, or end — not mid-word
  return new RegExp(`${tld.replace('.', '\\.')}(?=[\\/:?#]|$|\\s)`, 'i').test(hay)
}

export function pickOutreachLanguage(input: { url?: string | null; name?: string | null; text?: string | null }): OutreachLang {
  const url = String(input.url || '')
  const name = String(input.name || '')
  const text = String(input.text || '')

  // IDENTITY vs BODY. Country keywords are only trustworthy in the target's own
  // domain and name. Matching them against scraped page text mislabels any global
  // company that merely *mentions* a country: on 2026-07-30 a US affiliate network
  // (cj.com) was written to in Spanish because its site names Latin American markets.
  // Body text can still decide a language, but only on repeated language-specific
  // evidence — never on a single place name.
  const identity = `${url}\n${name}`
  const identityHay = identity.toLowerCase()
  const bodyHay = text.toLowerCase()
  const allRaw = `${identity}\n${text}`

  const countOf = (value: string, pattern: RegExp) => (value.match(pattern) || []).length
  // Word-boundary match, so "chile" cannot fire inside another word.
  const namedIn = (hay: string, names: string[]) =>
    names.some(candidate => new RegExp(`(^|[^a-z\u00e0-\u00ff])${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z\u00e0-\u00ff]|$)`, 'i').test(hay))

  // --- Russia: Cyrillic script, .ru, or country keywords ---
  // A stray Cyrillic word (a testimonial, a menu item) is not evidence the company
  // speaks Russian; a Cyrillic name or a body genuinely written in it is.
  if (/[\u0400-\u04FF]/.test(identity)) return 'ru'
  if (hasTld(url, '.ru') || /\brussia\b|\brussian\b|moscow|россия/.test(identityHay)) return 'ru'
  if (countOf(text, /[\u0400-\u04FF]/g) >= 40) return 'ru'

  // --- Poland: Polish-specific diacritics, .pl, or country/city keywords ---
  if (countOf(identity, /[ąćęłńśźż]/gi) >= 2) return 'pl'
  if (hasTld(url, '.pl') || /\bpoland\b|polska|polskie|warsaw|warszawa|krak[oó]w|wroc[lł]aw|gda[nń]sk|pozna[nń]/.test(identityHay)) return 'pl'
  if (countOf(text, /[ąćęłńśźż]/gi) >= 8) return 'pl'

  // --- Portuguese: Brazil/Portugal ccTLDs, country keywords, or sustained markers ---
  if (hasTld(url, '.br') || hasTld(url, '.pt') || /\bbrazil\b|brasil|\bportugal\b|lisboa|lisbon|porto|s[ãa]o paulo|rio de janeiro|belo horizonte/.test(identityHay)) return 'pt'
  const ptMarkers = countOf(allRaw, /\b(advocacia|advogad[oa]s?|serviços|você|não|obrigad[oa]|escritório|direito|cnpj|empresa|contacto)\b/gi) + countOf(allRaw, /[ãõ]/g)
  if (ptMarkers >= 3 && !/[ñ¿¡]/.test(allRaw)) return 'pt'

  // --- Spanish: Spain first, then Spanish-speaking LATAM ---
  if (hasTld(url, '.es') || /\bspain\b|españa|madrid|barcelona|valencia|sevilla/.test(identityHay)) return 'es'
  if (LATAM_TLDS.some(t => hasTld(url, t))) return 'es'
  if (namedIn(identityHay, LATAM_NAMES)) return 'es'
  const esMarkers = countOf(allRaw, /[ñ¿¡]/g) + countOf(allRaw, /\b(abogad[oa]s?|servicios|gracias|despacho jurídico|empresa|contacto)\b/gi)
  if (esMarkers >= 3) return 'es'
  // A country named only in body text is weak on its own — it needs Spanish prose with it.
  if (namedIn(bodyHay, LATAM_NAMES) && esMarkers >= 1) return 'es'

  // --- Everyone else: English ---
  return 'en'
}
