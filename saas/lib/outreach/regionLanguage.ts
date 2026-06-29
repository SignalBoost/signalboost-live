// saas/lib/outreach/regionLanguage.ts
// Region -> communication language, per the standing outreach directive:
//   Brazil -> Portuguese (pt), Spanish-speaking Latin America -> Spanish (es),
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
  const raw = `${url}\n${input.name || ''}\n${input.text || ''}`
  const hay = raw.toLowerCase()

  // --- Russia: Cyrillic script is unambiguous; also .ru / country keywords ---
  if (/[\u0400-\u04FF]/.test(raw)) return 'ru'
  if (hasTld(url, '.ru') || /\brussia\b|\brussian\b|moscow|россия/.test(hay)) return 'ru'

  // --- Poland: Polish-specific diacritics, .pl, or country/city keywords ---
  const polishDiacritics = (raw.match(/[ąćęłńśźż]/gi) || []).length
  if (polishDiacritics >= 2) return 'pl'
  if (hasTld(url, '.pl') || /\bpoland\b|polska|polskie|warsaw|warszawa|krak[oó]w|wroc[lł]aw|gda[nń]sk|pozna[nń]/.test(hay)) return 'pl'

  // --- Brazil: .br, country keywords, or clear Portuguese markers ---
  const ptMarkers = /\b(advocacia|advogad[oa]s?|serviços|você|não|obrigad[oa]|escritório|direito|cnpj)\b/.test(hay) || /[ãõ]/.test(raw)
  if (hasTld(url, '.br') || /\bbrazil\b|brasil|s[ãa]o paulo|rio de janeiro|belo horizonte/.test(hay)) return 'pt'
  if (ptMarkers && !/[ñ¿¡]/.test(raw)) return 'pt'

  // --- Spanish-speaking LATAM: ccTLDs, country names, or Spanish-only markers ---
  if (LATAM_TLDS.some(t => hasTld(url, t))) return 'es'
  if (LATAM_NAMES.some(n => hay.includes(n))) return 'es'
  if (/[ñ¿¡]/.test(raw) || /\b(abogad[oa]s?|servicios|gracias|despacho jurídico)\b/.test(hay)) return 'es'

  // --- Everyone else: English ---
  return 'en'
}
