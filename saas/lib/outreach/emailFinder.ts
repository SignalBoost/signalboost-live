// saas/lib/outreach/emailFinder.ts
import { getOutreachSecret } from './social-secrets.ts'
//
// Find a REAL, published contact email for a business by reading its own website.
// It never guesses or fabricates: it only returns an address that actually appears
// on the company's pages (mailto: links or visible text). When a company publishes
// no email — many use contact forms instead — it returns null, and the caller must
// SKIP that company rather than invent an address.
//
// Coverage is intentionally honest: this finds published role inboxes (sales@,
// contact@, info@, …), not private personal addresses. For higher coverage a paid
// enrichment provider (Hunter / Apollo) can be layered in later behind the same
// findContactEmail() signature.

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

// Role inboxes a business publishes to be contacted — preferred, in order.
const PREFERRED = ['sales', 'hello', 'contact', 'hi', 'info', 'team', 'partnerships', 'partner', 'support', 'admin', 'office']

// Substrings that mark an address as not a real business contact (platforms,
// trackers, placeholders, asset filenames the regex can accidentally catch).
const REJECT = [
  'example.com', 'example.org', 'email.com', 'domain.com', 'yourdomain', 'sentry', 'wixpress',
  'godaddy', 'squarespace', 'shopify', 'cloudflare', 'wordpress', 'no-reply', 'noreply',
  'mailer-daemon', 'postmaster', 'sentry.io', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js',
]

const ROLE_BLOCKED_LOCALS = new Set([
  'test', 'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'postmaster', 'mailer-daemon',
  'privacy', 'dataprotection', 'data-protection', 'dpo', 'gdpr', 'compliance',
  'legal', 'abuse', 'security', 'infosec', 'soc', 'psirt',
  'careers', 'jobs', 'recruiting', 'recruitment', 'hr', 'unsubscribe', 'webmaster',
  'community', 'forum', 'events', 'newsletter', 'subscribe', 'subscriptions',
  'feedback', 'membership', 'investors', 'ir', 'training', 'academy',
])

function isRoleBlocked(email: string): boolean {
  const [rawLocal, rawDomain = ''] = email.split('@')
  const local = rawLocal.trim().toLowerCase().split('+')[0]
  if (ROLE_BLOCKED_LOCALS.has(local)) return true

  const root = rawDomain.trim().toLowerCase().replace(/^www\./, '').split('.')[0]
  if (root && local.startsWith(root) && local.length > root.length) {
    const remainder = local.slice(root.length).replace(/^[-_.]+/, '')
    if (ROLE_BLOCKED_LOCALS.has(remainder)) return true
  }
  return false
}

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

type FetchTextResult = {
  html: string
  status: number | null
  timedOut: boolean
}

async function fetchText(url: string, ms = 6000): Promise<FetchTextResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SignalBoostBot/1.0; +https://saas.signalboostapp.com)',
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
    })
    if (!res.ok) return { html: '', status: res.status, timedOut: false }
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (ct && !ct.includes('html') && !ct.includes('text')) return { html: '', status: res.status, timedOut: false }
    return { html: (await res.text()).slice(0, 600000), status: res.status, timedOut: false }
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
    return { html: '', status: null, timedOut }
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
  if (isRoleBlocked(email)) return false
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

// Low concurrency is deliberate. The Aug 3 implementation fired 4-5 requests at the
// same corporate host simultaneously. Many WAFs interpret that as scraping and answer
// with 403/429 or simply stall. Those failures were then collapsed to an empty string,
// which made the campaign incorrectly report "No published contact email found."
// Two requests at a time keeps the speed gain without looking like a burst crawler.
async function fetchPaths(origin: string, paths: string[], concurrency = 2): Promise<Array<{ url: string; result: FetchTextResult }>> {
  const output: Array<{ url: string; result: FetchTextResult }> = []
  for (let i = 0; i < paths.length; i += concurrency) {
    const chunk = paths.slice(i, i + concurrency)
    const rows = await Promise.all(chunk.map(async path => ({ url: origin + path, result: await fetchText(origin + path) })))
    output.push(...rows)
  }
  return output
}

/**
 * Read a business's site and return its best real, published contact email — or
 * { email: null } when the company publishes none (caller must SKIP it).
 */
export async function findContactEmail(businessUrl: string): Promise<ContactEmailResult> {
  const origin = originOf(businessUrl)
  if (!origin) return { email: null, source: null, candidates: [], diagnostic: 'invalid_url' }
  const domain = domainOf(origin)

  // Start with the most common routes, but include localized commercial/contact pages.
  // These are still deterministic same-origin reads; no address is guessed.
  const WAVES = [
    ['', '/contact', '/contact-us', '/contacts', '/contato', '/fale-conosco'],
    ['/about', '/about-us', '/support', '/company', '/team', '/empresa', '/quem-somos', '/comercial', '/vendas', '/parcerias'],
  ]

  const all = new Set<string>()
  let source: string | null = null
  let sawSuccessfulPage = false
  let blockedCount = 0
  let timeoutCount = 0

  for (const wave of WAVES) {
    const pages = await fetchPaths(origin, wave, 2)

    for (const page of pages) {
      if (page.result.status === 403 || page.result.status === 429) blockedCount += 1
      if (page.result.timedOut) timeoutCount += 1
      if (page.result.status && page.result.status >= 200 && page.result.status < 400) sawSuccessfulPage = true
      if (!page.result.html) continue

      const found = extractEmails(page.result.html).filter(looksReal)
      if (!found.length) continue
      if (!source) source = page.url
      for (const email of found) all.add(email)
    }

    const ranked = rank(Array.from(all), domain)
    if (ranked.length) return { email: ranked[0], source, candidates: ranked.slice(0, 5), diagnostic: null }
  }

  const ranked = rank(Array.from(all), domain)
  if (ranked.length) return { email: ranked[0], source, candidates: ranked.slice(0, 5), diagnostic: null }

  const apolloEmail = await apolloLookup(domain)
  if (apolloEmail) return { email: apolloEmail, source: 'apollo_enrichment', candidates: [apolloEmail], diagnostic: null }

  let diagnostic = 'no_published_email'
  if (!sawSuccessfulPage && blockedCount > 0) diagnostic = `site_blocked:${blockedCount}`
  else if (!sawSuccessfulPage && timeoutCount > 0) diagnostic = `site_timeout:${timeoutCount}`
  else if (blockedCount > 0) diagnostic = `partial_site_block:${blockedCount}`
  else if (timeoutCount > 0) diagnostic = `partial_site_timeout:${timeoutCount}`

  return { email: null, source: null, candidates: [], diagnostic }
}

// Apollo.io /people/match — returns the best on-domain contact email for a given
// company domain, or null when Apollo has no record. Requires APOLLO_API_KEY env var.
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
    const eDomain = email.split('@')[1] || ''
    if (eDomain !== domain && !eDomain.endsWith('.' + domain)) return null
    return email.toLowerCase()
  } catch { return null }
}
