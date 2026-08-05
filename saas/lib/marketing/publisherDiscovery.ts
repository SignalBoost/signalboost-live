// saas/lib/marketing/publisherDiscovery.ts
type SearchResult = { title: string; url: string; description?: string }
type PublisherDiscoveryArgs = { brief: string; channel: string; region?: string | null }
export type PublisherDiscoveryResult = { ok: boolean; publicationName?: string; editorContact?: string; method?: 'email' | 'online_form'; sourceUrl?: string; error?: string; skipped?: boolean }
const SEARCH_LIMIT = 8
const FETCH_LIMIT = 6
const TIMEOUT_MS = 7000
const NON_PUBLISHER_DOMAINS = ['squareup.com','shopify.com','hubspot.com','mailchimp.com','wix.com','godaddy.com','semrush.com','ahrefs.com','moz.com','hootsuite.com','buffer.com','canva.com','prnewswire.com','businesswire.com','globenewswire.com','einpresswire.com','newswire.com','cision.com','muckrack.com','prowly.com','justreachout.io','openpr.com','facebook.com','linkedin.com','twitter.com','x.com','instagram.com','youtube.com','wikipedia.org','crunchbase.com','github.com','google.com','bing.com','yahoo.com','reddit.com']

// REGIONAL PUBLISHER SEARCH.
//
// This module could only ever find English-language outlets: every query string was
// hardcoded English ("local print newspaper submit news editor email") with no country,
// and the publication-signal words were English too — so a Brazilian *jornal* or a
// Mexican *periódico* did not register as a publication at all and was discarded before
// its contact page was ever fetched.
//
// Each profile carries the country's own words for the publication types, for the
// editorial contact prefixes, and for the submission paths, because those are what the
// outlet actually publishes on its own site.
type PressLocale = {
  searchName: string
  publicationWords: string[]
  techWords: string[]
  submitWords: string[]
  contactPrefixes: string[]
  // Paid-placement vocabulary: what an outlet calls its advertising page in ITS OWN
  // language. Without this the paid query went out in Portuguese for every country,
  // so a US or Polish rate-card search returned nothing usable.
  adWords: string[]
}

const PRESS_LOCALES: Record<string, PressLocale> = {
  br: {
    searchName: 'Brasil',
    publicationWords: ['jornal', 'revista', 'portal de notícias', 'diário'],
    techWords: ['tecnologia', 'TI', 'negócios'],
    submitWords: ['contato redação editor email', 'enviar pauta editor', 'fale conosco redação'],
    contactPrefixes: ['redacao', 'redação', 'pauta', 'noticias', 'jornalismo', 'imprensa'],
    adWords: ['anunciar publicidade media kit contato', 'tabela de preços anúncio'],
  },
  pt: {
    searchName: 'Portugal',
    publicationWords: ['jornal', 'revista', 'portal de notícias', 'diário'],
    techWords: ['tecnologia', 'TI', 'negócios'],
    submitWords: ['contacto redação editor email', 'enviar notícia editor'],
    contactPrefixes: ['redacao', 'redação', 'noticias', 'jornalismo', 'imprensa'],
    adWords: ['anunciar publicidade media kit contacto', 'tabela de preços anúncio'],
  },
  mx: { searchName: 'México', publicationWords: ['periódico', 'revista', 'diario', 'portal de noticias'], techWords: ['tecnología', 'TI', 'negocios'], submitWords: ['contacto redacción editor correo', 'enviar nota editor'], contactPrefixes: ['redaccion', 'redacción', 'noticias', 'prensa', 'periodismo'], adWords: ['anunciar publicidad media kit contacto', 'tarifas publicidad'], },
  ar: { searchName: 'Argentina', publicationWords: ['diario', 'revista', 'periódico', 'portal de noticias'], techWords: ['tecnología', 'TI', 'negocios'], submitWords: ['contacto redacción editor correo', 'enviar nota editor'], contactPrefixes: ['redaccion', 'redacción', 'noticias', 'prensa'], adWords: ['anunciar publicidad media kit contacto', 'tarifas publicidad'], },
  co: { searchName: 'Colombia', publicationWords: ['diario', 'revista', 'periódico', 'portal de noticias'], techWords: ['tecnología', 'TI', 'negocios'], submitWords: ['contacto redacción editor correo'], contactPrefixes: ['redaccion', 'redacción', 'noticias', 'prensa'], adWords: ['anunciar publicidad media kit contacto', 'tarifas publicidad'], },
  cl: { searchName: 'Chile', publicationWords: ['diario', 'revista', 'periódico', 'portal de noticias'], techWords: ['tecnología', 'TI', 'negocios'], submitWords: ['contacto redacción editor correo'], contactPrefixes: ['redaccion', 'redacción', 'noticias', 'prensa'], adWords: ['anunciar publicidad media kit contacto', 'tarifas publicidad'], },
  es: { searchName: 'España', publicationWords: ['periódico', 'revista', 'diario', 'portal de noticias'], techWords: ['tecnología', 'TI', 'negocios'], submitWords: ['contacto redacción editor correo'], contactPrefixes: ['redaccion', 'redacción', 'noticias', 'prensa'], adWords: ['anunciar publicidad media kit contacto', 'tarifas publicidad'], },
  pl: { searchName: 'Polska', publicationWords: ['gazeta', 'czasopismo', 'portal informacyjny', 'dziennik'], techWords: ['technologia', 'IT', 'biznes'], submitWords: ['kontakt redakcja e-mail', 'zgłoś temat redakcja'], contactPrefixes: ['redakcja', 'newsroom', 'kontakt'], adWords: ['reklama media kit kontakt', 'cennik reklamy'], },
  ru: { searchName: 'Россия', publicationWords: ['газета', 'журнал', 'новостной портал', 'издание'], techWords: ['технологии', 'ИТ', 'бизнес'], submitWords: ['контакты редакция email', 'прислать новость редакция'], contactPrefixes: ['redakciya', 'redaktor', 'news', 'press'], adWords: ['реклама медиакит контакты', 'прайс реклама'], },
  uk: { searchName: 'United Kingdom', publicationWords: ['newspaper', 'magazine', 'news site'], techWords: ['technology', 'IT', 'business'], submitWords: ['contact editor email', 'submit news editor'], contactPrefixes: ['editor', 'newsdesk', 'newsroom'], adWords: ['advertise media kit contact', 'advertising rate card'], },
  us: { searchName: 'United States', publicationWords: ['newspaper', 'magazine', 'trade publication'], techWords: ['technology', 'IT', 'business'], submitWords: ['submit news editor email', 'contact editor'], contactPrefixes: ['editor', 'newsroom', 'newsdesk'], adWords: ['advertise with us media kit contact', 'advertising rate card'], },
}

function normalizeRegion(region?: string | null): string {
  return String(region || '').replace(/^\s*(the|el|la|o|a)\s+/i, '').replace(/[.,;]+$/, '').trim()
}

function localeFor(region?: string | null): PressLocale | null {
  const wanted = normalizeRegion(region).toLowerCase()
  if (!wanted) return null
  for (const [code, locale] of Object.entries(PRESS_LOCALES)) {
    if (code === wanted) return locale
    if (locale.searchName.toLowerCase() === wanted) return locale
    if (wanted.includes(locale.searchName.toLowerCase())) return locale
  }
  const ALIASES: Record<string, string> = { brazil: 'br', brasil: 'br', portugal: 'pt', mexico: 'mx', 'méxico': 'mx', argentina: 'ar', colombia: 'co', chile: 'cl', spain: 'es', 'españa': 'es', poland: 'pl', polska: 'pl', russia: 'ru', 'united kingdom': 'uk', britain: 'uk', 'united states': 'us', usa: 'us', america: 'us' }
  const code = ALIASES[wanted]
  return code ? PRESS_LOCALES[code] : null
}

function clean(value: unknown, max = 240) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max) }
function domainOf(url: string) { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } }
function titleToPublication(title: string, url: string) { const domain = domainOf(url); const first = clean(title.split(/[|—-]/)[0] || '', 80); return first || domain || 'Publisher' }
function wantsPaidPlacement(brief: string) { const t = String(brief || '').toLowerCase(); return /\b(paid|pay|paid\s+ad|paid\s+ads|paid\s+advertising|paid\s+placement|sponsored|sponsorship|media\s*kit|rate\s*card|buy\s+ad|purchase\s+ad)\b/i.test(t) }
function extractEmails(html: string) { const found = new Set<string>(); const decoded = html.replace(/\s*\[at\]\s*/gi, '@').replace(/\s*\(at\)\s*/gi, '@').replace(/\s+at\s+/gi, '@').replace(/\s*\[dot\]\s*/gi, '.').replace(/\s*\(dot\)\s*/gi, '.').replace(/\s+dot\s+/gi, '.'); for (const match of decoded.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) { const email = match[0].toLowerCase().replace(/[),.;:]+$/, ''); if (/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(email)) continue; if (/^(no-?reply|donotreply|privacy|legal|abuse|support)@/i.test(email)) continue; found.add(email) } return [...found] }
function contactEmailPriority(email: string) { if (/^(editor|editors|newsroom|tips|news|press|media|submit|submissions|letters|opinion|events)@/i.test(email)) return 0; if (/^(info|hello|contact)@/i.test(email)) return 1; if (/^(advertising|ads|sponsor|sales|partnerships|partners)@/i.test(email)) return 2; return 3 }
function isBlockedDomain(url: string) { const host = domainOf(url); return !host || NON_PUBLISHER_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`)) }
function isGuideOrMarketingPage(result: SearchResult) { const text = `${result.title} ${result.description || ''} ${result.url}`.toLowerCase(); return /(how\s+to|guide|tips|template|examples?|checklist|what\s+is|learn|blog\/|\/blog|resources?|academy|the-bottom-line|press-release-distribution-guide|distribute\s+(a\s+)?press\s+release)/i.test(text) }
function hasPublisherSignals(html: string, url: string, result: SearchResult, locale?: PressLocale | null) {
  const host = domainOf(url)
  const text = `${result.title} ${result.description || ''} ${html.slice(0, 8000)}`.toLowerCase()
  const publicationSignals = /(newspaper|magazine|journal|newsroom|editorial|local news|community news|daily|weekly|gazette|times|tribune|herald|observer|post|press|independent|courier|ledger|record|bulletin|news tip|letters to the editor|submit news|submit a story)/i.test(text)
  const publisherDomainSignals = /\b(news|times|tribune|herald|gazette|observer|post|press|journal|magazine|weekly|daily|courier|ledger|record|bulletin)\b/i.test(host.replace(/[-.]/g, ' '))
  // Regional vocabulary. Without this a Brazilian jornal or a Polish gazeta fails every
  // English signal above and is discarded before its contact page is even read.
  const regionalWords = locale ? [...locale.publicationWords, ...locale.contactPrefixes] : []
  const regionalSignals = regionalWords.some(word => text.includes(word.toLowerCase()) || host.replace(/[-.]/g, ' ').includes(word.toLowerCase()))
  return publicationSignals || publisherDomainSignals || regionalSignals
}

function isFreeEditorialContact(email: string, allowPaid: boolean, locale?: PressLocale | null) {
  if (/^(advertising|ads|sponsor|sales|partnerships|partners)@/i.test(email)) return allowPaid
  if (/^(editor|editors|newsroom|tips|news|press|media|submit|submissions|letters|opinion|events|info|hello|contact)@/i.test(email)) return true
  // A Brazilian outlet publishes redacao@, a Polish one redakcja@ — neither matches the
  // English prefix list, and rejecting them discards the correct editorial address.
  const prefixes = locale?.contactPrefixes || []
  return prefixes.some(prefix => new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@`, 'i').test(email))
}

function isAllowedSubmissionPath(url: string, allowPaid: boolean) { const path = url.toLowerCase(); if (/(advertis|media-kit|mediakit|sponsor|rate-card|rates)/i.test(path)) return allowPaid; return /(submit-news|submit_story|submit-story|submit\/?$|news-tip|tips|contact|editorial|letters|letter-to-the-editor|write-for-us|contribute|community|events|press-release|pressroom)/i.test(path) }
function extractSubmissionFormUrl(html: string, pageUrl: string, allowPaid: boolean) { const base = new URL(pageUrl); const candidates: string[] = []; for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) { try { const raw = match[1]; if (!raw || raw.startsWith('#') || raw.startsWith('mailto:')) continue; const absolute = new URL(raw, base).toString(); if (domainOf(absolute) !== domainOf(pageUrl)) continue; if (isAllowedSubmissionPath(absolute, allowPaid)) candidates.push(absolute) } catch {} } return candidates[0] || null }
function looksLikePublisher(result: SearchResult) { if (isBlockedDomain(result.url)) return false; if (isGuideOrMarketingPage(result)) return false; return true }
async function fetchWithTimeout(url: string) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), TIMEOUT_MS); try { const res = await fetch(url, { headers: { 'user-agent': 'SignalBoostBot/1.0 publisher-contact-discovery' }, signal: controller.signal }); if (!res.ok) return ''; const type = res.headers.get('content-type') || ''; if (!type.includes('text/html') && !type.includes('text/plain')) return ''; return (await res.text()).slice(0, 250000) } catch { return '' } finally { clearTimeout(timer) } }
async function braveSearch(query: string): Promise<SearchResult[]> { const key = process.env.BRAVE_SEARCH_API_KEY; if (!key) return []; const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${SEARCH_LIMIT}`; const res = await fetch(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': key } }); if (!res.ok) return []; const json: any = await res.json().catch(() => ({})); return ((json.web?.results || []) as any[]).map((item) => ({ title: clean(item.title), url: String(item.url || ''), description: clean(item.description) })).filter((item) => item.url) }
async function serperSearch(query: string): Promise<SearchResult[]> { const key = process.env.SERPER_API_KEY; if (!key) return []; const res = await fetch('https://google.serper.dev/search', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': key }, body: JSON.stringify({ q: query, num: SEARCH_LIMIT }) }); if (!res.ok) return []; const json: any = await res.json().catch(() => ({})); return ((json.organic || []) as any[]).map((item) => ({ title: clean(item.title), url: String(item.link || ''), description: clean(item.snippet) })).filter((item) => item.url) }
async function searchWeb(query: string) { const brave = await braveSearch(query); if (brave.length) return brave; return serperSearch(query) }
function queriesFor(args: PublisherDiscoveryArgs) {
  const channel = String(args.channel || '').toLowerCase()
  const paid = wantsPaidPlacement(args.brief)
  const locale = localeFor(args.region)

  // With a known region, search in that country's own language: an English query
  // returns English-language outlets no matter which country name is appended.
  if (locale) {
    const place = locale.searchName
    const kinds = channel.includes('trade')
      ? locale.publicationWords.filter(word => /revista|magazine|czasopismo|журнал/i.test(word)).concat(locale.publicationWords[0])
      : locale.publicationWords
    const free: string[] = []
    for (const kind of kinds.slice(0, 3)) {
      free.push(clean(`${kind} ${locale.techWords[0]} ${place} ${locale.submitWords[0]}`, 140))
    }
    free.push(clean(`${kinds[0]} ${place} ${locale.submitWords[1] || locale.submitWords[0]}`, 140))
    const paidQueries = locale.adWords.map(words => clean(`${kinds[0]} ${place} ${words}`, 140))
    return paid ? [...free, ...paidQueries] : free
  }

  const base = channel.includes('trade') ? 'technology business magazine publication' : channel.includes('print') ? 'local print newspaper' : 'local newspaper publication'

  // A NAMED SECTOR NARROWS THE QUERY, IT DOES NOT REPLACE IT. Each sector gets its own
  // "<sector> publication submit editorial contact" search — a DevOps query and a
  // cybersecurity query surface different outlets, deliberately, because the owner asked
  // for both. The generic queries still run after, as a fallback if a sector search comes
  // up short, never as the only attempt when a brief was this specific about what it wanted.
  const sectors = sectorsFrom(args.brief)
  if (sectors.length) {
    const sectorQueries = sectors.map(word => clean(`${word} publication submit editorial contact write for us`, 140))
    const paidSectorQueries = paid ? sectors.map(word => clean(`${word} magazine advertise media kit contact`, 140)) : []
    return [...sectorQueries, ...paidSectorQueries, ...genericQueries(channel, base, paid)]
  }

  return genericQueries(channel, base, paid)
}

// SECTOR EXTRACTION — read what the brief actually asked for.
//
// A campaign brief like "IT and technology magazines. Cloud, SaaS, DevOps, SRE, MSP, and
// cybersecurity publications. Marketing and sales publications. Trade journals." was, until
// this, entirely discarded. Without a named country, discovery collapsed every brief to one
// query — "technology business magazine publication submit news editor email" — and that
// query does not distinguish a DevOps campaign from a marketing campaign from a fintech one.
// It searches for "press" in general, and general press includes lifestyle magazines,
// consumer complaint sites, and every SEO-farmed directory that ranks for the word.
//
// The brief already names the sectors. This reads them out instead of throwing them away.
// Ordered by BREADTH, not by where it sits in a typical brief — the cap below keeps only
// the first few matches, so a brief naming DevOps, SRE, MSP, cybersecurity, cloud and SaaS
// in that order must not let three near-synonyms (DevOps/SRE/MSP all name adjacent ops
// roles) crowd out cybersecurity and SaaS entirely. One query per DISTINCT sector family.
const SECTORS: Array<{ match: RegExp; queryWords: string[] }> = [
  { match: /cybersecurity|infosec|information security/i, queryWords: ['cybersecurity'] },
  { match: /\bSaaS\b|software.as.a.service/i, queryWords: ['SaaS'] },
  { match: /\bcloud\b/i, queryWords: ['cloud computing'] },
  { match: /\bdevops\b/i, queryWords: ['DevOps'] },
  { match: /marketing (?:and|&) sales|sales publication/i, queryWords: ['marketing and sales'] },
  { match: /\bMSP\b|managed service provider/i, queryWords: ['MSP'] },
  { match: /\bSRE\b|site reliability/i, queryWords: ['SRE'] },
  { match: /trade journal/i, queryWords: ['trade journal'] },
  { match: /industry newsletter/i, queryWords: ['industry newsletter'] },
  { match: /IT (?:and|&) technology|tech(?:nology)? magazine/i, queryWords: ['IT and technology'] },
]

/** Sector phrases named in the brief, in the order they were named — capped so a long brief
 *  produces a bounded number of searches rather than one per matched word. */
function sectorsFrom(brief: string): string[] {
  const text = String(brief || '')
  const found: string[] = []
  for (const sector of SECTORS) {
    if (sector.match.test(text)) found.push(...sector.queryWords)
  }
  return [...new Set(found)].slice(0, 5)
}

function genericQueries(channel: string, base: string, paid: boolean): string[] {
  const freeQueries = [`${base} submit news editor email`, `${base} news tips editor email`, `${base} submit story contact editor`, `${base} letters to the editor email`]
  const paidQueries = [`${base} advertise contact email`, `${base} media kit advertising contact`]
  return paid ? [...freeQueries, ...paidQueries] : freeQueries
}

async function inspectCandidate(result: SearchResult, allowPaid: boolean, locale?: PressLocale | null): Promise<PublisherDiscoveryResult> { if (!looksLikePublisher(result)) return { ok: false, error: 'unsupported_candidate' }; const urls = [result.url]; const root = (() => { try { const u = new URL(result.url); return `${u.protocol}//${u.host}` } catch { return '' } })(); if (root) { urls.push(`${root}/contact`, `${root}/news-tips`, `${root}/submit-news`, `${root}/submit`, `${root}/letters`, `${root}/opinion`, `${root}/events`, `${root}/write-for-us`); if (allowPaid) urls.push(`${root}/advertise`, `${root}/media-kit`) } for (const url of [...new Set(urls)].slice(0, FETCH_LIMIT)) { const html = await fetchWithTimeout(url); if (!html) continue; if (!hasPublisherSignals(html, url, result, locale)) continue; const emails = extractEmails(html).filter((email) => isFreeEditorialContact(email, allowPaid, locale)).sort((a, b) => contactEmailPriority(a) - contactEmailPriority(b)); if (emails[0]) return { ok: true, publicationName: titleToPublication(result.title, result.url), editorContact: emails[0], method: 'email', sourceUrl: url }; const form = extractSubmissionFormUrl(html, url, allowPaid); if (form) return { ok: true, publicationName: titleToPublication(result.title, result.url), editorContact: form, method: 'online_form', sourceUrl: url } } return { ok: false, error: 'no_free_publisher_contact_found' } }
export async function discoverPublisherTarget(args: PublisherDiscoveryArgs): Promise<PublisherDiscoveryResult> { if (!process.env.BRAVE_SEARCH_API_KEY && !process.env.SERPER_API_KEY) return { ok: false, skipped: true, error: 'publisher_search_api_not_configured' }; const allowPaid = wantsPaidPlacement(args.brief); const seen = new Set<string>(); for (const query of queriesFor(args)) { const results = await searchWeb(query); for (const result of results) { if (!result.url || seen.has(result.url)) continue; seen.add(result.url); const inspected = await inspectCandidate(result, allowPaid, localeFor(args.region)); if (inspected.ok) return inspected } } return { ok: false, error: allowPaid ? 'no_publisher_contact_found' : 'no_free_actual_publication_contact_found' } }

/**
 * Multi-result publisher search — the shape a campaign needs.
 *
 * discoverPublisherTarget returns the FIRST usable outlet and stops, which suits a
 * single placement. A press campaign needs a list, in a named country, so this walks
 * the same region-aware queries and collects every outlet with a real editorial contact
 * until it has enough or runs out of budget.
 *
 * Bounded on purpose: this runs inside a serverless function, and each candidate costs
 * several page fetches.
 */
export async function discoverPublishers(args: {
  brief: string
  channel: string
  region?: string | null
  limit?: number
  budgetMs?: number
}): Promise<{ ok: boolean; publishers: PublisherDiscoveryResult[]; error?: string; examined: number }> {
  if (!process.env.BRAVE_SEARCH_API_KEY && !process.env.SERPER_API_KEY) {
    return { ok: false, publishers: [], examined: 0, error: 'publisher_search_api_not_configured' }
  }
  const startedAt = Date.now()
  const budget = Math.max(10_000, Math.min(args.budgetMs ?? 45_000, 120_000))
  const outOfTime = () => Date.now() - startedAt > budget
  const limit = Math.max(1, Math.min(args.limit ?? 10, 25))

  const locale = localeFor(args.region)
  const allowPaid = wantsPaidPlacement(args.brief)
  const seen = new Set<string>()
  const publishers: PublisherDiscoveryResult[] = []
  let examined = 0

  for (const query of queriesFor({ brief: args.brief, channel: args.channel, region: args.region })) {
    if (publishers.length >= limit || outOfTime()) break
    for (const result of await searchWeb(query)) {
      if (publishers.length >= limit || outOfTime()) break
      const host = domainOf(result.url)
      if (!result.url || !host || seen.has(host)) continue
      seen.add(host)
      examined += 1
      const inspected = await inspectCandidate(result, allowPaid, locale)
      if (inspected.ok) publishers.push(inspected)
    }
  }

  if (!publishers.length) {
    return {
      ok: false,
      publishers: [],
      examined,
      error: examined
        ? `Examined ${examined} sites in ${normalizeRegion(args.region) || 'the requested region'} but none published an editorial contact.`
        : 'No publications found for this region.',
    }
  }
  return { ok: true, publishers, examined }
}
