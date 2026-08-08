// saas/lib/outreach/emailFinder.ts
import { getOutreachSecret } from './social-secrets.ts'

// Find a REAL, published contact email for a business by reading its own website.
// Never invent addresses. Crawl only the target's own site and return only on-domain email.

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const PREFERRED = ['sales', 'hello', 'contact', 'contato', 'hi', 'info', 'team', 'partnerships', 'partner', 'support', 'suporte', 'admin', 'office', 'comercial', 'vendas']
const REJECT = [
  'example.com', 'example.org', 'email.com', 'domain.com', 'yourdomain', 'sentry', 'wixpress',
  'godaddy', 'squarespace', 'shopify', 'cloudflare', 'wordpress', 'no-reply', 'noreply',
  'mailer-daemon', 'postmaster', 'sentry.io', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js',
]

const CONTACT_HINT = /(contact|contato|fale.?conosco|about|sobre|quem.?somos|support|suporte|company|empresa|team|equipe|comercial|vendas|sales|partner|parceria)/i
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)

function normalizeInput(raw: string): URL | null {
  try {
    let value = String(raw || '').trim()
    if (!value) return null
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value
    return new URL(value)
  } catch { return null }
}

function canonicalHost(hostname: string): string {
  return String(hostname || '').replace(/^www\./i, '').toLowerCase()
}

function sameBusinessHost(a: string, b: string): boolean {
  return canonicalHost(a) === canonicalHost(b)
}

function looksReal(email: string): boolean {
  if (!isEmail(email) || email.length > 100) return false
  if (REJECT.some(bad => email.includes(bad))) return false
  return true
}

function extractEmails(html: string): string[] {
  const out = new Set<string>()
  for (const m of (html.match(/mailto:([^"'>\s?]+)/gi) || [])) {
    try {
      const e = decodeURIComponent(m.replace(/^mailto:/i, '')).split('?')[0].trim().toLowerCase()
      if (e) out.add(e)
    } catch { /* ignore malformed URI */ }
  }
  for (const e of (html.match(EMAIL_RE) || [])) out.add(e.toLowerCase())
  return Array.from(out)
}

function rank(emails: string[], domain: string): string[] {
  const onDomain = (e: string) => {
    const eDomain = (e.split('@')[1] || '').toLowerCase()
    return eDomain === domain || eDomain.endsWith('.' + domain)
  }
  const score = (e: string) => {
    const local = e.split('@')[0].toLowerCase()
    const pref = PREFERRED.findIndex(p => local === p || local.startsWith(p))
    return pref === -1 ? 100 : pref
  }
  return Array.from(new Set(emails.map(e => e.toLowerCase())))
    .filter(looksReal)
    .filter(onDomain)
    .sort((a, b) => score(a) - score(b))
}

type FetchResult = {
  ok: boolean
  html: string
  url: string
  status: number | null
  error: string | null
}

async function fetchPage(url: string, ms = 10000): Promise<FetchResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
      },
    })
    const finalUrl = res.url || url
    if (!res.ok) return { ok: false, html: '', url: finalUrl, status: res.status, error: `http_${res.status}` }
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (ct && !ct.includes('html') && !ct.includes('text')) {
      return { ok: false, html: '', url: finalUrl, status: res.status, error: 'unsupported_content_type' }
    }
    return { ok: true, html: (await res.text()).slice(0, 800000), url: finalUrl, status: res.status, error: null }
  } catch (err) {
    const name = err instanceof Error ? err.name : 'fetch_error'
    return { ok: false, html: '', url, status: null, error: name === 'AbortError' ? 'timeout' : name }
  } finally {
    clearTimeout(timer)
  }
}

function discoverContactLinks(html: string, pageUrl: string, targetHost: string): string[] {
  const out = new Set<string>()
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const href = String(match[1] || '').trim()
    const text = String(match[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!href || href.startsWith('#') || /^mailto:|^tel:|^javascript:/i.test(href)) continue
    if (!CONTACT_HINT.test(`${href} ${text}`)) continue
    try {
      const u = new URL(href, pageUrl)
      if (!/^https?:$/i.test(u.protocol)) continue
      if (!sameBusinessHost(u.hostname, targetHost)) continue
      u.hash = ''
      out.add(u.toString())
    } catch { /* ignore malformed links */ }
  }
  return Array.from(out)
}

function rootCandidates(input: URL): string[] {
  const out = new Set<string>()
  const host = input.hostname
  const hosts = host.startsWith('www.') ? [host, host.replace(/^www\./i, '')] : [host, `www.${host}`]
  for (const h of hosts) {
    out.add(`https://${h}/`)
    out.add(`http://${h}/`)
  }
  return Array.from(out)
}

export type ContactEmailResult = {
  email: string | null
  source: string | null
  candidates: string[]
  diagnostic?: string | null
}

export async function findContactEmail(businessUrl: string): Promise<ContactEmailResult> {
  const input = normalizeInput(businessUrl)
  if (!input) throw new Error(`email_discovery_invalid_url:${businessUrl}`)

  const targetDomain = canonicalHost(input.hostname)
  const allEmails = new Set<string>()
  const visited = new Set<string>()
  const failures: string[] = []
  let successfulPages = 0
  let source: string | null = null
  let activeRoot: string | null = null
  let homeHtml = ''
  let homeUrl = ''

  // First establish a reachable canonical homepage. This handles www/non-www and
  // HTTPS/HTTP differences instead of declaring a company email-less when one variant fails.
  for (const candidate of rootCandidates(input)) {
    const page = await fetchPage(candidate)
    if (!page.ok) {
      failures.push(`${candidate}:${page.error || 'fetch_failed'}`)
      continue
    }
    try {
      const finalHost = new URL(page.url).hostname
      if (!sameBusinessHost(finalHost, input.hostname)) {
        failures.push(`${candidate}:redirected_off_domain`)
        continue
      }
    } catch {
      failures.push(`${candidate}:bad_final_url`)
      continue
    }
    activeRoot = new URL(page.url).origin
    homeHtml = page.html
    homeUrl = page.url
    successfulPages += 1
    visited.add(page.url)
    for (const e of extractEmails(page.html)) allEmails.add(e)
    const rankedHome = rank(Array.from(allEmails), targetDomain)
    if (rankedHome.length) {
      return { email: rankedHome[0], source: page.url, candidates: rankedHome.slice(0, 5), diagnostic: null }
    }
    break
  }

  if (!activeRoot) {
    throw new Error(`email_discovery_site_unreachable:${businessUrl}:${failures.slice(0, 4).join('|')}`)
  }

  // Follow the site's REAL contact/about/support links, then fill gaps with common routes.
  const discovered = discoverContactLinks(homeHtml, homeUrl, input.hostname)
  const guessed = [
    '/contact', '/contact-us', '/contacts', '/contato', '/contato/', '/fale-conosco', '/fale-conosco/',
    '/about', '/about-us', '/sobre', '/sobre-nos', '/sobre-nos/', '/quem-somos', '/support', '/suporte',
    '/company', '/empresa', '/team', '/equipe', '/comercial', '/vendas', '/sales', '/parcerias',
  ].map(path => new URL(path, activeRoot!).toString())

  const queue = Array.from(new Set([...discovered, ...guessed])).slice(0, 18)

  // Low concurrency avoids WAF burst blocking but is fast enough for the campaign worker.
  for (let i = 0; i < queue.length; i += 2) {
    const batch = queue.slice(i, i + 2).filter(url => !visited.has(url))
    if (!batch.length) continue
    const pages = await Promise.all(batch.map(url => fetchPage(url)))

    for (const page of pages) {
      visited.add(page.url)
      if (!page.ok) {
        failures.push(`${page.url}:${page.error || 'fetch_failed'}`)
        continue
      }
      successfulPages += 1
      for (const e of extractEmails(page.html)) {
        if (!source && rank([e], targetDomain).length) source = page.url
        allEmails.add(e)
      }
    }

    const ranked = rank(Array.from(allEmails), targetDomain)
    if (ranked.length) {
      return { email: ranked[0], source: source || pages.find(p => p.ok)?.url || homeUrl, candidates: ranked.slice(0, 5), diagnostic: null }
    }
  }

  const apolloEmail = await apolloLookup(targetDomain)
  if (apolloEmail) return { email: apolloEmail, source: 'apollo_enrichment', candidates: [apolloEmail], diagnostic: null }

  throw new Error(
    `email_discovery_no_email:${businessUrl}:pages=${successfulPages}:emails_seen=${allEmails.size}:failures=${failures.slice(0, 4).join('|')}`,
  )
}

async function apolloLookup(domain: string): Promise<string | null> {
  const key = getOutreachSecret('APOLLO_API_KEY')
  if (!key || !domain) return null
  try {
    const res = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ api_key: key, organization_domain: domain }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const d: any = await res.json().catch(() => null)
    const email: string = d?.person?.email || d?.person?.personal_emails?.[0] || ''
    if (!email || !looksReal(email)) return null
    const eDomain = (email.split('@')[1] || '').toLowerCase()
    if (eDomain !== domain && !eDomain.endsWith('.' + domain)) return null
    return email.toLowerCase()
  } catch { return null }
}
