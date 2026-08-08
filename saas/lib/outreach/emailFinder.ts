// saas/lib/outreach/emailFinder.ts
import { getOutreachSecret } from './social-secrets.ts'
//
// Find a REAL, published contact email for a business by reading its own website.
// It never guesses or fabricates: it only returns an address that actually appears
// on the company's pages (mailto: links or visible text). When a company publishes
// no email — many use contact forms instead — it returns null, and the caller must
// SKIP that company rather than invent an address.
//
// This file intentionally restores the exact discovery behavior from immediately
// before the Aug 3 regression. New filtering/crawl changes should be reintroduced
// only after this baseline is verified against known published addresses.

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const PREFERRED = ['sales', 'hello', 'contact', 'hi', 'info', 'team', 'partnerships', 'partner', 'support', 'admin', 'office']
const REJECT = [
  'example.com', 'example.org', 'email.com', 'domain.com', 'yourdomain', 'sentry', 'wixpress',
  'godaddy', 'squarespace', 'shopify', 'cloudflare', 'wordpress', 'no-reply', 'noreply',
  'mailer-daemon', 'postmaster', 'sentry.io', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js',
]

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)

function originOf(raw: string): string | null {
  try {
    let u = String(raw || '').trim()
    if (!u) return null
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u
    return new URL(u).origin
  } catch { return null }
}
function domainOf(origin: string): string {
  try { return new URL(origin).hostname.replace(/^www\./i, '').toLowerCase() } catch { return '' }
}

async function fetchText(url: string, ms = 8000): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SignalBoostBot/1.0; +https://saas.signalboostapp.com)' },
    })
    if (!res.ok) return ''
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (ct && !ct.includes('html') && !ct.includes('text')) return ''
    return (await res.text()).slice(0, 600000)
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

function extractEmails(html: string): string[] {
  const out = new Set<string>()
  for (const m of (html.match(/mailto:([^"'>\s?]+)/gi) || [])) {
    const e = decodeURIComponent(m.replace(/^mailto:/i, '')).split('?')[0].trim().toLowerCase()
    if (e) out.add(e)
  }
  for (const e of (html.match(EMAIL_RE) || [])) out.add(e.toLowerCase())
  return Array.from(out)
}

function looksReal(email: string): boolean {
  if (!isEmail(email) || email.length > 100) return false
  if (REJECT.some(bad => email.includes(bad))) return false
  return true
}

function rank(emails: string[], domain: string): string[] {
  const clean = Array.from(new Set(emails)).filter(looksReal)
  const onDomain = (e: string) => !!domain && (e.endsWith('@' + domain) || e.endsWith('.' + domain))
  const score = (e: string) => {
    const local = e.split('@')[0]
    const pref = PREFERRED.findIndex(p => local === p || local.startsWith(p))
    return (onDomain(e) ? 0 : 1000) + (pref === -1 ? 100 : pref)
  }
  const onDom = clean.filter(onDomain)
  return onDom.sort((a, b) => score(a) - score(b))
}

export type ContactEmailResult = {
  email: string | null
  source: string | null
  candidates: string[]
  diagnostic?: string | null
}

export async function findContactEmail(businessUrl: string): Promise<ContactEmailResult> {
  const origin = originOf(businessUrl)
  if (!origin) return { email: null, source: null, candidates: [], diagnostic: 'invalid_url' }
  const domain = domainOf(origin)

  const WAVES = [
    ['', '/contact', '/contact-us', '/contacts'],
    ['/about', '/about-us', '/support', '/company', '/team'],
  ]

  const all = new Set<string>()
  let source: string | null = null

  for (const wave of WAVES) {
    const pages = await Promise.all(
      wave.map(async path => ({ url: origin + path, html: await fetchText(origin + path) })),
    )

    for (const page of pages) {
      if (!page.html) continue
      const found = extractEmails(page.html).filter(looksReal)
      if (!found.length) continue
      if (!source) source = page.url
      for (const email of found) all.add(email)
    }

    const best = rank(Array.from(all), domain)[0]
    if (best) return { email: best, source, candidates: rank(Array.from(all), domain).slice(0, 5), diagnostic: null }
  }

  const ranked = rank(Array.from(all), domain)
  if (ranked.length) return { email: ranked[0], source, candidates: ranked.slice(0, 5), diagnostic: null }

  const apolloEmail = await apolloLookup(domain)
  if (apolloEmail) return { email: apolloEmail, source: 'apollo_enrichment', candidates: [apolloEmail], diagnostic: null }

  return { email: null, source: null, candidates: [], diagnostic: 'no_published_email' }
}

async function apolloLookup(domain: string): Promise<string | null> {
  const key = getOutreachSecret('APOLLO_API_KEY')
  if (!key || !domain) return null
  try {
    const res = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ api_key: key, organization_domain: domain }),
    })
    if (!res.ok) return null
    const d: any = await res.json().catch(() => null)
    const email: string = d?.person?.email || d?.person?.personal_emails?.[0] || ''
    if (!email || !looksReal(email)) return null
    const eDomain = email.split('@')[1] || ''
    if (eDomain !== domain && !eDomain.endsWith('.' + domain)) return null
    return email.toLowerCase()
  } catch { return null }
}
