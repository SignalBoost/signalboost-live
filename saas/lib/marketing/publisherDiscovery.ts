// saas/lib/marketing/publisherDiscovery.ts
//
// FIRST-PARTY PRESS AND PUBLICITY DISCOVERY.
//
// The search result is only a lead. A candidate is returned only after this module
// reads the opportunity owner's own website and finds a submission target there.
// Directories, product listings, newsletters, contributed-content programmes and
// editorial publications are different opportunity types and are validated as such.

export type PressOpportunityType =
  | 'editorial_publication'
  | 'contributed_content'
  | 'newsletter'
  | 'interview_or_expert_commentary'
  | 'business_directory'
  | 'product_listing'

type SearchResult = { title: string; url: string; description?: string }
type PublisherDiscoveryArgs = {
  brief: string
  channel: string
  region?: string | null
  namedTargets?: string[]
}

export type PublisherDiscoveryResult = {
  ok: boolean
  publicationName?: string
  editorContact?: string
  method?: 'email' | 'online_form'
  sourceUrl?: string
  evidenceUrl?: string
  opportunityType?: PressOpportunityType
  discoveryQuery?: string
  firstPartyEvidence?: boolean
  error?: string
  skipped?: boolean
}

export type PublisherDiscoveryRejection = {
  publicationName: string
  sourceUrl: string
  opportunityType: PressOpportunityType
  query: string
  reason: string
}

export type PublisherSearchQuery = {
  query: string
  opportunityType: PressOpportunityType
  vertical: string
  namedTarget?: string
}

const SEARCH_LIMIT = 8
const FETCH_LIMIT = 8
const TIMEOUT_MS = 7000
const QUERY_LIMIT = 24

const BLOCKED_SEARCH_DOMAINS = [
  'squareup.com', 'shopify.com', 'hubspot.com', 'mailchimp.com', 'wix.com',
  'godaddy.com', 'semrush.com', 'ahrefs.com', 'moz.com', 'hootsuite.com',
  'buffer.com', 'canva.com', 'prnewswire.com', 'businesswire.com',
  'globenewswire.com', 'einpresswire.com', 'newswire.com', 'cision.com',
  'muckrack.com', 'prowly.com', 'justreachout.io', 'openpr.com', 'facebook.com',
  'linkedin.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com',
  'wikipedia.org', 'crunchbase.com', 'github.com', 'google.com', 'bing.com',
  'yahoo.com', 'reddit.com',
]

type PressLocale = {
  searchName: string
  publicationWords: string[]
  techWords: string[]
  submitWords: string[]
  contactPrefixes: string[]
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
  mx: { searchName: 'México', publicationWords: ['periódico', 'revista', 'diario', 'portal de noticias'], techWords: ['tecnología', 'TI', 'negocios'], submitWords: ['contacto redacción editor correo', 'enviar nota editor'], contactPrefixes: ['redaccion', 'redacción', 'noticias', 'prensa', 'periodismo'], adWords: ['anunciar publicidad media kit contacto', 'tarifas publicidad'] },
  ar: { searchName: 'Argentina', publicationWords: ['diario', 'revista', 'periódico', 'portal de noticias'], techWords: ['tecnología', 'TI', 'negocios'], submitWords: ['contacto redacción editor correo', 'enviar nota editor'], contactPrefixes: ['redaccion', 'redacción', 'noticias', 'prensa'], adWords: ['anunciar publicidad media kit contacto', 'tarifas publicidad'] },
  co: { searchName: 'Colombia', publicationWords: ['diario', 'revista', 'periódico', 'portal de noticias'], techWords: ['tecnología', 'TI', 'negocios'], submitWords: ['contacto redacción editor correo'], contactPrefixes: ['redaccion', 'redacción', 'noticias', 'prensa'], adWords: ['anunciar publicidad media kit contacto', 'tarifas publicidad'] },
  cl: { searchName: 'Chile', publicationWords: ['diario', 'revista', 'periódico', 'portal de noticias'], techWords: ['tecnología', 'TI', 'negocios'], submitWords: ['contacto redacción editor correo'], contactPrefixes: ['redaccion', 'redacción', 'noticias', 'prensa'], adWords: ['anunciar publicidad media kit contacto', 'tarifas publicidad'] },
  es: { searchName: 'España', publicationWords: ['periódico', 'revista', 'diario', 'portal de noticias'], techWords: ['tecnología', 'TI', 'negocios'], submitWords: ['contacto redacción editor correo'], contactPrefixes: ['redaccion', 'redacción', 'noticias', 'prensa'], adWords: ['anunciar publicidad media kit contacto', 'tarifas publicidad'] },
  pl: { searchName: 'Polska', publicationWords: ['gazeta', 'czasopismo', 'portal informacyjny', 'dziennik'], techWords: ['technologia', 'IT', 'biznes'], submitWords: ['kontakt redakcja e-mail', 'zgłoś temat redakcja'], contactPrefixes: ['redakcja', 'newsroom', 'kontakt'], adWords: ['reklama media kit kontakt', 'cennik reklamy'] },
  ru: { searchName: 'Россия', publicationWords: ['газета', 'журнал', 'новостной портал', 'издание'], techWords: ['технологии', 'ИТ', 'бизнес'], submitWords: ['контакты редакция email', 'прислать новость редакция'], contactPrefixes: ['redakciya', 'redaktor', 'news', 'press'], adWords: ['реклама медиакит контакты', 'прайс реклама'] },
  uk: { searchName: 'United Kingdom', publicationWords: ['newspaper', 'magazine', 'news site'], techWords: ['technology', 'IT', 'business'], submitWords: ['contact editor email', 'submit news editor'], contactPrefixes: ['editor', 'newsdesk', 'newsroom'], adWords: ['advertise media kit contact', 'advertising rate card'] },
  us: { searchName: 'United States', publicationWords: ['newspaper', 'magazine', 'trade publication'], techWords: ['technology', 'IT', 'business'], submitWords: ['submit news editor email', 'contact editor'], contactPrefixes: ['editor', 'newsroom', 'newsdesk'], adWords: ['advertise with us media kit contact', 'advertising rate card'] },
}

const VERTICALS: Array<{ label: string; match: RegExp }> = [
  { label: 'cloud SaaS DevOps SRE', match: /\bcloud\b|\bSaaS\b|software.as.a.service|\bDevOps\b|\bSRE\b|site reliability/i },
  { label: 'MSP managed services', match: /\bMSP\b|managed service provider|managed services/i },
  { label: 'cybersecurity', match: /cybersecurity|infosec|information security/i },
  { label: 'IT enterprise technology', match: /\bIT\b|information technology|enterprise technology|technology magazine|tech magazine/i },
  { label: 'business startup', match: /business publication|startup|entrepreneur|company announcement/i },
  { label: 'marketing sales', match: /marketing|sales publication|sales magazine|revenue operations|martech/i },
]

const TYPE_RULES: Array<{ type: PressOpportunityType; match: RegExp }> = [
  { type: 'editorial_publication', match: /publication|newspaper|magazine|journal|editorial|press release|company announcement|newsroom/i },
  { type: 'contributed_content', match: /contributed article|contributor|guest article|guest post|write for us|op-ed|opinion/i },
  { type: 'newsletter', match: /newsletter|industry newsletter/i },
  { type: 'interview_or_expert_commentary', match: /interview|expert commentary|expert comment|podcast guest|source request/i },
  { type: 'business_directory', match: /business director|company director|free director|business listing/i },
  { type: 'product_listing', match: /product submission|product-submission|product listing|submit product|launch site|software director/i },
]

const TYPE_QUERY_TERMS: Record<PressOpportunityType, string> = {
  editorial_publication: 'publication magazine submit news editor contact',
  contributed_content: 'publication write for us contributor guidelines',
  newsletter: 'newsletter submit news pitch editor',
  interview_or_expert_commentary: 'publication interview expert commentary pitch',
  business_directory: 'business directory add company free listing',
  product_listing: 'product directory submit product free listing',
}

const TYPE_PATHS: Record<PressOpportunityType, RegExp> = {
  editorial_publication: /(submit-news|submit_story|submit-story|news-tip|tips|contact|editorial|letters|letter-to-the-editor|press-release|pressroom)/i,
  contributed_content: /(write-for-us|contribut|guest-post|guest-author|submit-article|opinion|op-ed)/i,
  newsletter: /(newsletter|submit-news|pitch|contact|editorial)/i,
  interview_or_expert_commentary: /(interview|expert|commentary|source|podcast|guest|pitch|contact)/i,
  business_directory: /(add-business|submit-business|business-listing|company-listing|claim-listing|directory|register)/i,
  product_listing: /(submit-product|add-product|product-listing|launch|directory|showcase|register)/i,
}

function clean(value: unknown, max = 240): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeRegion(region?: string | null): string {
  return String(region || '').replace(/^\s*(the|el|la|o|a)\s+/i, '').replace(/[.,;]+$/, '').trim()
}

function localeFor(region?: string | null): PressLocale | null {
  const wanted = normalizeRegion(region).toLowerCase()
  if (!wanted) return null
  for (const [code, locale] of Object.entries(PRESS_LOCALES)) {
    if (code === wanted || locale.searchName.toLowerCase() === wanted || wanted.includes(locale.searchName.toLowerCase())) return locale
  }
  const aliases: Record<string, string> = {
    brazil: 'br', brasil: 'br', portugal: 'pt', mexico: 'mx', 'méxico': 'mx',
    argentina: 'ar', colombia: 'co', chile: 'cl', spain: 'es', 'españa': 'es',
    poland: 'pl', polska: 'pl', russia: 'ru', 'united kingdom': 'uk', britain: 'uk',
    'united states': 'us', usa: 'us', america: 'us',
  }
  return aliases[wanted] ? PRESS_LOCALES[aliases[wanted]] : null
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./i, '').toLowerCase() } catch { return '' }
}

const TWO_LEVEL_SUFFIXES = new Set(['co.uk', 'org.uk', 'com.br', 'net.br', 'com.mx', 'com.ar', 'com.au', 'co.jp', 'com.pl', 'co.za'])
function registrableDomain(host: string): string {
  const parts = host.split('.').filter(Boolean)
  if (parts.length <= 2) return host
  return TWO_LEVEL_SUFFIXES.has(parts.slice(-2).join('.')) ? parts.slice(-3).join('.') : parts.slice(-2).join('.')
}

function titleToPublication(title: string, url: string): string {
  const first = clean(title.split(/[|—]/)[0] || '', 100)
  return first || domainOf(url) || 'Opportunity owner'
}

function isBlockedDomain(url: string): boolean {
  const host = domainOf(url)
  return !host || BLOCKED_SEARCH_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`))
}

function wantsPaidPlacement(brief: string): boolean {
  return /\b(paid|paid advertising|paid placement|sponsored|sponsorship|media kit|rate card|buy ad|purchase ad)\b/i.test(String(brief || ''))
}

export function extractPressVerticals(brief: string): string[] {
  const text = String(brief || '')
  const found = VERTICALS.filter(vertical => vertical.match.test(text)).map(vertical => vertical.label)
  return found.length ? found : ['technology business']
}

export function extractOpportunityTypes(brief: string): PressOpportunityType[] {
  const text = String(brief || '')
  const found = TYPE_RULES.filter(rule => rule.match.test(text)).map(rule => rule.type)
  return found.length ? [...new Set(found)] : ['editorial_publication']
}

export function extractNamedTargets(brief: string): string[] {
  const text = String(brief || '')
  const marker = text.match(/(?:named targets?|specific publications?|target list)\s*:\s*([^\n]{1,800})/i)
  if (!marker) return []
  return marker[1]
    .split(/,|;|\n|\s+and\s+/i)
    .map(value => clean(value.replace(/^[-*\d.\s]+/, ''), 120))
    .filter(value => value.length >= 2)
    .slice(0, 40)
}

function queryForLocale(locale: PressLocale, vertical: string, type: PressOpportunityType): string {
  if (type === 'editorial_publication') {
    return clean(`${vertical} ${locale.publicationWords[0]} ${locale.searchName} ${locale.submitWords[0]}`, 160)
  }
  return clean(`${vertical} ${locale.searchName} ${TYPE_QUERY_TERMS[type]}`, 160)
}

export function buildPublisherQueries(args: PublisherDiscoveryArgs): PublisherSearchQuery[] {
  const verticals = extractPressVerticals(args.brief)
  const types = extractOpportunityTypes(args.brief)
  const locale = localeFor(args.region)
  const namedTargets = [...new Set([...(args.namedTargets || []), ...extractNamedTargets(args.brief)])]
    .map(target => clean(target, 120))
    .filter(Boolean)

  const queries: PublisherSearchQuery[] = []
  for (const target of namedTargets) {
    for (const type of types) {
      queries.push({
        query: clean(`"${target}" ${TYPE_QUERY_TERMS[type]}`, 180),
        opportunityType: type,
        vertical: target,
        namedTarget: target,
      })
    }
  }

  // Every requested vertical receives an editorial search. This prevents adjacent
  // operations terms from crowding out cybersecurity, MSP, business or marketing.
  for (const vertical of verticals) {
    queries.push({
      query: locale
        ? queryForLocale(locale, vertical, 'editorial_publication')
        : clean(`${vertical} ${TYPE_QUERY_TERMS.editorial_publication}`, 160),
      opportunityType: 'editorial_publication',
      vertical,
    })
  }

  // Non-editorial opportunity types are searched separately and never sent through
  // the publication admission gate merely because they appeared in a press brief.
  for (const type of types.filter(value => value !== 'editorial_publication')) {
    for (const vertical of verticals) {
      queries.push({
        query: locale ? queryForLocale(locale, vertical, type) : clean(`${vertical} ${TYPE_QUERY_TERMS[type]}`, 160),
        opportunityType: type,
        vertical,
      })
    }
  }

  if (wantsPaidPlacement(args.brief)) {
    const vertical = verticals[0]
    const paid = locale
      ? `${vertical} ${locale.searchName} ${locale.adWords[0]}`
      : `${vertical} publication advertise media kit contact`
    queries.push({ query: clean(paid, 160), opportunityType: 'editorial_publication', vertical })
  }

  const seen = new Set<string>()
  return queries.filter(item => {
    const key = `${item.opportunityType}:${item.query.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, QUERY_LIMIT)
}

function extractEmails(html: string): string[] {
  const found = new Set<string>()
  const decoded = html
    .replace(/\s*\[at\]\s*/gi, '@').replace(/\s*\(at\)\s*/gi, '@').replace(/\s+at\s+/gi, '@')
    .replace(/\s*\[dot\]\s*/gi, '.').replace(/\s*\(dot\)\s*/gi, '.').replace(/\s+dot\s+/gi, '.')
  for (const match of decoded.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const email = match[0].toLowerCase().replace(/[),.;:]+$/, '')
    if (/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(email)) continue
    if (/^(no-?reply|donotreply|privacy|legal|abuse|support)@/i.test(email)) continue
    found.add(email)
  }
  return [...found]
}

function typeEmailPriority(email: string, type: PressOpportunityType, locale?: PressLocale | null): number {
  const local = email.split('@')[0]
  const preferred: Record<PressOpportunityType, RegExp> = {
    editorial_publication: /^(editor|editors|newsroom|tips|news|press|media|submit|submissions|letters|opinion|events)$/i,
    contributed_content: /^(editor|contributors?|submissions?|opinion|features?|guest)$/i,
    newsletter: /^(editor|newsletter|news|tips|submissions?|hello|contact)$/i,
    interview_or_expert_commentary: /^(editor|features?|interviews?|podcast|media|press|newsroom)$/i,
    business_directory: /^(listings?|directory|business|hello|info|contact)$/i,
    product_listing: /^(products?|submissions?|launch|listings?|hello|info|contact)$/i,
  }
  if (preferred[type].test(local)) return 0
  if ((locale?.contactPrefixes || []).some(prefix => local.toLowerCase() === prefix.toLowerCase())) return 0
  if (/^(info|hello|contact)$/i.test(local)) return 1
  return 2
}

function opportunitySignals(type: PressOpportunityType, text: string): boolean {
  const rules: Record<PressOpportunityType, RegExp> = {
    editorial_publication: /(newspaper|magazine|journal|newsroom|editorial|news site|daily|weekly|gazette|tribune|herald|press|submit news|news tips)/i,
    contributed_content: /(write for us|contributor|contributed article|guest post|submit an article|op-ed|opinion submission)/i,
    newsletter: /(newsletter|subscribe|newsletter editor|submit news|pitch us)/i,
    interview_or_expert_commentary: /(interview|expert commentary|expert source|podcast guest|media request|pitch)/i,
    business_directory: /(business directory|add your business|submit business|company listing|claim your listing)/i,
    product_listing: /(submit product|add product|product directory|product listing|launch your product|showcase)/i,
  }
  return rules[type].test(text)
}

function firstPartyEmail(email: string, pageUrl: string): boolean {
  const emailHost = String(email.split('@')[1] || '').toLowerCase()
  const pageHost = domainOf(pageUrl)
  return Boolean(emailHost && pageHost && registrableDomain(emailHost) === registrableDomain(pageHost))
}

function allowedTargetUrl(url: string, type: PressOpportunityType): boolean {
  return TYPE_PATHS[type].test(url.toLowerCase())
}

function extractSubmissionTarget(html: string, pageUrl: string, type: PressOpportunityType): string | null {
  if (allowedTargetUrl(pageUrl, type) && /<form\b/i.test(html)) return pageUrl
  let base: URL
  try { base = new URL(pageUrl) } catch { return null }
  for (const match of html.matchAll(/(?:href|action)=["']([^"']+)["']/gi)) {
    try {
      const raw = match[1]
      if (!raw || raw.startsWith('#') || raw.startsWith('mailto:')) continue
      const absolute = new URL(raw, base).toString()
      if (registrableDomain(domainOf(absolute)) !== registrableDomain(domainOf(pageUrl))) continue
      if (allowedTargetUrl(absolute, type)) return absolute
    } catch { /* skip malformed links */ }
  }
  return null
}

function candidateUrls(resultUrl: string, type: PressOpportunityType): string[] {
  let root = ''
  try { const value = new URL(resultUrl); root = `${value.protocol}//${value.host}` } catch {}
  const suffixes: Record<PressOpportunityType, string[]> = {
    editorial_publication: ['/contact', '/news-tips', '/submit-news', '/submit', '/editorial', '/pressroom'],
    contributed_content: ['/write-for-us', '/contributors', '/contribute', '/submit-article', '/opinion'],
    newsletter: ['/newsletter', '/contact', '/submit-news', '/pitch'],
    interview_or_expert_commentary: ['/contact', '/interviews', '/podcast', '/pitch', '/media'],
    business_directory: ['/add-business', '/submit-business', '/business-listing', '/directory', '/register'],
    product_listing: ['/submit-product', '/add-product', '/products', '/launch', '/showcase'],
  }
  return [...new Set([resultUrl, ...suffixes[type].map(path => `${root}${path}`)])].filter(Boolean).slice(0, FETCH_LIMIT)
}

function matchesNamedTarget(result: SearchResult, namedTarget?: string): boolean {
  if (!namedTarget) return true
  const wanted = namedTarget.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const actual = `${result.title} ${domainOf(result.url)}`.toLowerCase().replace(/[^a-z0-9]+/g, '')
  return wanted.length >= 3 && (actual.includes(wanted) || wanted.includes(actual.slice(0, Math.min(actual.length, wanted.length))))
}

function looksLikeCandidate(result: SearchResult, type: PressOpportunityType): boolean {
  if (!result.url || isBlockedDomain(result.url)) return false
  const text = `${result.title} ${result.description || ''} ${result.url}`
  if (type === 'business_directory' || type === 'product_listing') {
    return !/(how to|guide|tips|template|examples?|checklist|what is)/i.test(text)
  }
  return !/(how to|guide|template|checklist|press-release-distribution-guide)/i.test(text)
}

async function fetchWithTimeout(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'SignalBoostBot/1.0 first-party-opportunity-discovery' },
      signal: controller.signal,
    })
    if (!response.ok) return ''
    const type = response.headers.get('content-type') || ''
    if (!type.includes('text/html') && !type.includes('text/plain')) return ''
    return (await response.text()).slice(0, 250000)
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

async function braveSearch(query: string): Promise<SearchResult[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY
  if (!key) return []
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${SEARCH_LIMIT}`
  const response = await fetch(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': key } })
  if (!response.ok) return []
  const json: any = await response.json().catch(() => ({}))
  return ((json.web?.results || []) as any[])
    .map(item => ({ title: clean(item.title), url: String(item.url || ''), description: clean(item.description) }))
    .filter(item => item.url)
}

async function serperSearch(query: string): Promise<SearchResult[]> {
  const key = process.env.SERPER_API_KEY
  if (!key) return []
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
    body: JSON.stringify({ q: query, num: SEARCH_LIMIT }),
  })
  if (!response.ok) return []
  const json: any = await response.json().catch(() => ({}))
  return ((json.organic || []) as any[])
    .map(item => ({ title: clean(item.title), url: String(item.link || ''), description: clean(item.snippet) }))
    .filter(item => item.url)
}

async function searchWeb(query: string): Promise<SearchResult[]> {
  const brave = await braveSearch(query)
  return brave.length ? brave : serperSearch(query)
}

async function inspectCandidate(
  result: SearchResult,
  search: PublisherSearchQuery,
  locale?: PressLocale | null,
): Promise<PublisherDiscoveryResult> {
  if (!looksLikeCandidate(result, search.opportunityType)) return { ok: false, error: 'unsupported_candidate' }
  if (!matchesNamedTarget(result, search.namedTarget)) return { ok: false, error: 'named_target_mismatch' }

  for (const url of candidateUrls(result.url, search.opportunityType)) {
    const html = await fetchWithTimeout(url)
    if (!html) continue
    const text = `${result.title} ${result.description || ''} ${url} ${html.slice(0, 20000)}`
    if (!opportunitySignals(search.opportunityType, text)) continue

    const emails = extractEmails(html)
      .filter(email => firstPartyEmail(email, url))
      .sort((a, b) => typeEmailPriority(a, search.opportunityType, locale) - typeEmailPriority(b, search.opportunityType, locale))
    if (emails[0]) {
      return {
        ok: true,
        publicationName: titleToPublication(result.title, result.url),
        editorContact: emails[0],
        method: 'email',
        sourceUrl: result.url,
        evidenceUrl: url,
        opportunityType: search.opportunityType,
        discoveryQuery: search.query,
        firstPartyEvidence: true,
      }
    }

    const form = extractSubmissionTarget(html, url, search.opportunityType)
    if (form) {
      return {
        ok: true,
        publicationName: titleToPublication(result.title, result.url),
        editorContact: form,
        method: 'online_form',
        sourceUrl: result.url,
        evidenceUrl: url,
        opportunityType: search.opportunityType,
        discoveryQuery: search.query,
        firstPartyEvidence: true,
      }
    }
  }
  return { ok: false, error: 'no_first_party_submission_target_found' }
}

export async function discoverPublisherTarget(args: PublisherDiscoveryArgs): Promise<PublisherDiscoveryResult> {
  if (!process.env.BRAVE_SEARCH_API_KEY && !process.env.SERPER_API_KEY) {
    return { ok: false, skipped: true, error: 'publisher_search_api_not_configured' }
  }
  const locale = localeFor(args.region)
  for (const search of buildPublisherQueries(args)) {
    for (const result of await searchWeb(search.query)) {
      const inspected = await inspectCandidate(result, search, locale)
      if (inspected.ok) return inspected
    }
  }
  return { ok: false, error: 'no_first_party_opportunity_found' }
}

export async function discoverPublishers(args: PublisherDiscoveryArgs & {
  limit?: number
  budgetMs?: number
}): Promise<{
  ok: boolean
  publishers: PublisherDiscoveryResult[]
  rejections: PublisherDiscoveryRejection[]
  error?: string
  examined: number
  verified: number
  rejectedByDiscovery: number
  queries: PublisherSearchQuery[]
}> {
  const queries = buildPublisherQueries(args)
  if (!process.env.BRAVE_SEARCH_API_KEY && !process.env.SERPER_API_KEY) {
    return {
      ok: false, publishers: [], rejections: [], examined: 0, verified: 0,
      rejectedByDiscovery: 0, queries, error: 'publisher_search_api_not_configured',
    }
  }

  const startedAt = Date.now()
  const budget = Math.max(10_000, Math.min(args.budgetMs ?? 45_000, 120_000))
  const outOfTime = () => Date.now() - startedAt > budget
  const limit = Math.max(1, Math.min(args.limit ?? 10, 25))
  const locale = localeFor(args.region)
  const seen = new Set<string>()
  const publishers: PublisherDiscoveryResult[] = []
  const rejections: PublisherDiscoveryRejection[] = []
  let examined = 0

  for (const search of queries) {
    if (publishers.length >= limit || outOfTime()) break
    for (const result of await searchWeb(search.query)) {
      if (publishers.length >= limit || outOfTime()) break
      const host = domainOf(result.url)
      const key = `${search.opportunityType}:${host}`
      if (!result.url || !host || seen.has(key)) continue
      seen.add(key)
      examined += 1
      const inspected = await inspectCandidate(result, search, locale)
      if (inspected.ok) {
        publishers.push(inspected)
      } else {
        rejections.push({
          publicationName: titleToPublication(result.title, result.url),
          sourceUrl: result.url,
          opportunityType: search.opportunityType,
          query: search.query,
          reason: inspected.error || 'discovery_rejected',
        })
      }
    }
  }

  if (!publishers.length) {
    return {
      ok: false,
      publishers,
      rejections,
      examined,
      verified: 0,
      rejectedByDiscovery: rejections.length,
      queries,
      error: examined
        ? `Examined ${examined} first-party sites in ${normalizeRegion(args.region) || 'the requested markets'} but found no verified submission opportunity.`
        : 'No opportunities were found for the requested verticals.',
    }
  }

  return {
    ok: true,
    publishers,
    rejections,
    examined,
    verified: publishers.length,
    rejectedByDiscovery: rejections.length,
    queries,
  }
}
