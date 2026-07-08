type SearchResult = {
  title: string
  url: string
  description?: string
}

type PublisherDiscoveryArgs = {
  brief: string
  channel: string
}

export type PublisherDiscoveryResult = {
  ok: boolean
  publicationName?: string
  editorContact?: string
  method?: 'email' | 'online_form'
  sourceUrl?: string
  error?: string
  skipped?: boolean
}

const SEARCH_LIMIT = 8
const FETCH_LIMIT = 6
const TIMEOUT_MS = 7000

const NON_PUBLISHER_DOMAINS = [
  'squareup.com', 'shopify.com', 'hubspot.com', 'mailchimp.com', 'wix.com', 'godaddy.com',
  'semrush.com', 'ahrefs.com', 'moz.com', 'hootsuite.com', 'buffer.com', 'canva.com',
  'prnewswire.com', 'businesswire.com', 'globenewswire.com', 'einpresswire.com', 'newswire.com',
  'cision.com', 'muckrack.com', 'prowly.com', 'justreachout.io', 'openpr.com',
  'facebook.com', 'linkedin.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com',
  'wikipedia.org', 'crunchbase.com', 'github.com', 'google.com', 'bing.com', 'yahoo.com', 'reddit.com',
]

function clean(value: unknown, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

function titleToPublication(title: string, url: string) {
  const domain = domainOf(url)
  const first = clean(title.split(/[|—-]/)[0] || '', 80)
  return first || domain || 'Publisher'
}

function wantsPaidPlacement(brief: string) {
  return /\b(paid|pay|advertis(e|ing|ement)|sponsor(ed)?|media\s*kit|rate\s*card|ad\s*placement|buy\s+ad|paid\s+placement)\b/i.test(String(brief || ''))
}

function extractEmails(html: string) {
  const found = new Set<string>()
  const decoded = html
    .replace(/\s*\[at\]\s*/gi, '@')
    .replace(/\s*\(at\)\s*/gi, '@')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s*\[dot\]\s*/gi, '.')
    .replace(/\s*\(dot\)\s*/gi, '.')
    .replace(/\s+dot\s+/gi, '.')

  for (const match of decoded.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const email = match[0].toLowerCase().replace(/[),.;:]+$/, '')
    if (/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(email)) continue
    if (/^(no-?reply|donotreply|privacy|legal|abuse|support)@/i.test(email)) continue
    found.add(email)
  }
  return [...found]
}

function contactEmailPriority(email: string) {
  if (/^(editor|editors|newsroom|tips|news|press|media|submit|submissions|letters|opinion|events)@/i.test(email)) return 0
  if (/^(info|hello|contact)@/i.test(email)) return 1
  if (/^(advertising|ads|sponsor|sales|partnerships|partners)@/i.test(email)) return 2
  return 3
}

function isBlockedDomain(url: string) {
  const host = domainOf(url)
  return !host || NON_PUBLISHER_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

function isGuideOrMarketingPage(result: SearchResult) {
  const text = `${result.title} ${result.description || ''} ${result.url}`.toLowerCase()
  return /(how\s+to|guide|tips|template|examples?|checklist|what\s+is|learn|blog\/|\/blog|resources?|academy|the-bottom-line|press-release-distribution-guide|distribute\s+(a\s+)?press\s+release)/i.test(text)
}

function hasPublisherSignals(html: string, url: string, result: SearchResult) {
  const host = domainOf(url)
  const text = `${result.title} ${result.description || ''} ${html.slice(0, 8000)}`.toLowerCase()
  const publicationSignals = /(newspaper|magazine|journal|newsroom|editorial|local news|community news|daily|weekly|gazette|times|tribune|herald|observer|post|press|independent|courier|ledger|record|bulletin|news tip|letters to the editor|submit news|submit a story)/i.test(text)
  const publisherDomainSignals = /\b(news|times|tribune|herald|gazette|observer|post|press|journal|magazine|weekly|daily|courier|ledger|record|bulletin)\b/i.test(host.replace(/[-.]/g, ' '))
  return publicationSignals || publisherDomainSignals
}

function isFreeEditorialContact(email: string, allowPaid: boolean) {
  if (/^(advertising|ads|sponsor|sales|partnerships|partners)@/i.test(email)) return allowPaid
  return /^(editor|editors|newsroom|tips|news|press|media|submit|submissions|letters|opinion|events|info|hello|contact)@/i.test(email)
}

function isAllowedSubmissionPath(url: string, allowPaid: boolean) {
  const path = url.toLowerCase()
  if (/(advertis|media-kit|mediakit|sponsor|rate-card|rates)/i.test(path)) return allowPaid
  return /(submit-news|submit_story|submit-story|submit\/?$|news-tip|tips|contact|editorial|letters|letter-to-the-editor|write-for-us|contribute|community|events|press-release|pressroom)/i.test(path)
}

function extractSubmissionFormUrl(html: string, pageUrl: string, allowPaid: boolean) {
  const base = new URL(pageUrl)
  const candidates: string[] = []
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const raw = match[1]
      if (!raw || raw.startsWith('#') || raw.startsWith('mailto:')) continue
      const absolute = new URL(raw, base).toString()
      if (domainOf(absolute) !== domainOf(pageUrl)) continue
      if (isAllowedSubmissionPath(absolute, allowPaid)) candidates.push(absolute)
    } catch {}
  }
  return candidates[0] || null
}

function looksLikePublisher(result: SearchResult) {
  if (isBlockedDomain(result.url)) return false
  if (isGuideOrMarketingPage(result)) return false
  return true
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'SignalBoostBot/1.0 publisher-contact-discovery' },
      signal: controller.signal,
    })
    if (!res.ok) return ''
    const type = res.headers.get('content-type') || ''
    if (!type.includes('text/html') && !type.includes('text/plain')) return ''
    return (await res.text()).slice(0, 250000)
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
  const res = await fetch(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': key } })
  if (!res.ok) return []
  const json: any = await res.json().catch(() => ({}))
  return ((json.web?.results || []) as any[]).map((item) => ({ title: clean(item.title), url: String(item.url || ''), description: clean(item.description) })).filter((item) => item.url)
}

async function serperSearch(query: string): Promise<SearchResult[]> {
  const key = process.env.SERPER_API_KEY
  if (!key) return []
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
    body: JSON.stringify({ q: query, num: SEARCH_LIMIT }),
  })
  if (!res.ok) return []
  const json: any = await res.json().catch(() => ({}))
  return ((json.organic || []) as any[]).map((item) => ({ title: clean(item.title), url: String(item.link || ''), description: clean(item.snippet) })).filter((item) => item.url)
}

async function searchWeb(query: string) {
  const brave = await braveSearch(query)
  if (brave.length) return brave
  return serperSearch(query)
}

function queriesFor(args: PublisherDiscoveryArgs) {
  const channel = String(args.channel || '').toLowerCase()
  const paid = wantsPaidPlacement(args.brief)
  const base = channel.includes('trade') ? 'technology business magazine publication' : channel.includes('print') ? 'local print newspaper' : 'local newspaper publication'
  const freeQueries = [
    `${base} submit news editor email`,
    `${base} news tips editor email`,
    `${base} submit story contact editor`,
    `${base} letters to the editor email`,
  ]
  const paidQueries = [`${base} advertise contact email`, `${base} media kit advertising contact`]
  return paid ? [...freeQueries, ...paidQueries] : freeQueries
}

async function inspectCandidate(result: SearchResult, allowPaid: boolean): Promise<PublisherDiscoveryResult> {
  if (!looksLikePublisher(result)) return { ok: false, error: 'unsupported_candidate' }
  const urls = [result.url]
  const root = (() => {
    try {
      const u = new URL(result.url)
      return `${u.protocol}//${u.host}`
    } catch {
      return ''
    }
  })()
  if (root) {
    urls.push(`${root}/contact`, `${root}/news-tips`, `${root}/submit-news`, `${root}/submit`, `${root}/letters`, `${root}/opinion`, `${root}/events`, `${root}/write-for-us`)
    if (allowPaid) urls.push(`${root}/advertise`, `${root}/media-kit`)
  }

  for (const url of [...new Set(urls)].slice(0, FETCH_LIMIT)) {
    const html = await fetchWithTimeout(url)
    if (!html) continue
    if (!hasPublisherSignals(html, url, result)) continue

    const emails = extractEmails(html).filter((email) => isFreeEditorialContact(email, allowPaid)).sort((a, b) => contactEmailPriority(a) - contactEmailPriority(b))
    if (emails[0]) {
      return { ok: true, publicationName: titleToPublication(result.title, result.url), editorContact: emails[0], method: 'email', sourceUrl: url }
    }

    const form = extractSubmissionFormUrl(html, url, allowPaid)
    if (form) {
      return { ok: true, publicationName: titleToPublication(result.title, result.url), editorContact: form, method: 'online_form', sourceUrl: url }
    }
  }

  return { ok: false, error: 'no_free_publisher_contact_found' }
}

export async function discoverPublisherTarget(args: PublisherDiscoveryArgs): Promise<PublisherDiscoveryResult> {
  if (!process.env.BRAVE_SEARCH_API_KEY && !process.env.SERPER_API_KEY) {
    return { ok: false, skipped: true, error: 'publisher_search_api_not_configured' }
  }

  const allowPaid = wantsPaidPlacement(args.brief)
  const seen = new Set<string>()
  for (const query of queriesFor(args)) {
    const results = await searchWeb(query)
    for (const result of results) {
      if (!result.url || seen.has(result.url)) continue
      seen.add(result.url)
      const inspected = await inspectCandidate(result, allowPaid)
      if (inspected.ok) return inspected
    }
  }

  return { ok: false, error: allowPaid ? 'no_publisher_contact_found' : 'no_free_actual_publication_contact_found' }
}
