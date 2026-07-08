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

function clean(value: unknown, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function titleToPublication(title: string, url: string) {
  const domain = domainOf(url)
  const first = clean(title.split(/[|—-]/)[0] || '', 80)
  return first || domain || 'Publisher'
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
    if (/^(no-?reply|donotreply|privacy|legal|abuse)@/i.test(email)) continue
    found.add(email)
  }
  return [...found]
}

function contactEmailPriority(email: string) {
  if (/^(editor|editors|newsroom|tips|press|media|advertising|ads|sponsor|submit|submissions|partnerships|partners)@/i.test(email)) return 0
  if (/^(info|hello|contact)@/i.test(email)) return 1
  if (/^(support|sales)@/i.test(email)) return 2
  return 3
}

function extractSubmissionFormUrl(html: string, pageUrl: string) {
  const base = new URL(pageUrl)
  const candidates: string[] = []
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const raw = match[1]
      if (!raw || raw.startsWith('#') || raw.startsWith('mailto:')) continue
      const absolute = new URL(raw, base).toString()
      if (domainOf(absolute) !== domainOf(pageUrl)) continue
      if (/(submit|contact|advertis|media-kit|mediakit|press|sponsor|partner|write-for-us|contribute|editorial|news-tip|tip)/i.test(absolute)) {
        candidates.push(absolute)
      }
    } catch {}
  }
  return candidates[0] || null
}

function looksLikePublisher(url: string) {
  const host = domainOf(url)
  if (!host) return false
  if (/(facebook|linkedin|twitter|x\.com|instagram|youtube|wikipedia|crunchbase|github|google|bing|yahoo|reddit)\./i.test(host)) return false
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
  const base = channel.includes('trade') ? 'technology startup SaaS publication' : 'small business news publication'
  return [
    `${base} submit press release editor email`,
    `${base} advertise contact media kit email`,
    `${base} submit news contact form`,
  ]
}

async function inspectCandidate(result: SearchResult): Promise<PublisherDiscoveryResult> {
  if (!looksLikePublisher(result.url)) return { ok: false, error: 'unsupported_candidate' }
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
    urls.push(`${root}/contact`, `${root}/advertise`, `${root}/media-kit`, `${root}/submit`, `${root}/submit-news`, `${root}/write-for-us`)
  }

  for (const url of [...new Set(urls)].slice(0, FETCH_LIMIT)) {
    const html = await fetchWithTimeout(url)
    if (!html) continue
    const emails = extractEmails(html).sort((a, b) => contactEmailPriority(a) - contactEmailPriority(b))
    if (emails[0]) {
      return {
        ok: true,
        publicationName: titleToPublication(result.title, result.url),
        editorContact: emails[0],
        method: 'email',
        sourceUrl: url,
      }
    }
    const form = extractSubmissionFormUrl(html, url)
    if (form) {
      return {
        ok: true,
        publicationName: titleToPublication(result.title, result.url),
        editorContact: form,
        method: 'online_form',
        sourceUrl: url,
      }
    }
  }

  return { ok: false, error: 'no_contact_found' }
}

export async function discoverPublisherTarget(args: PublisherDiscoveryArgs): Promise<PublisherDiscoveryResult> {
  if (!process.env.BRAVE_SEARCH_API_KEY && !process.env.SERPER_API_KEY) {
    return { ok: false, skipped: true, error: 'publisher_search_api_not_configured' }
  }

  const seen = new Set<string>()
  for (const query of queriesFor(args)) {
    const results = await searchWeb(query)
    for (const result of results) {
      if (!result.url || seen.has(result.url)) continue
      seen.add(result.url)
      const inspected = await inspectCandidate(result)
      if (inspected.ok) return inspected
    }
  }

  return { ok: false, error: 'no_publisher_with_public_contact_found' }
}
