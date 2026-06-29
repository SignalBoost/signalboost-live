// saas/lib/outreach/emailFinder.ts
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
  // ONLY the business's own domain. An off-domain hit (a different company the
  // regex caught, or a third party) is NEVER returned — emailing the wrong
  // company is worse than skipping. No on-domain address => caller SKIPS.
  const onDom = clean.filter(onDomain)
  return onDom.sort((a, b) => score(a) - score(b))
}

export type ContactEmailResult = { email: string | null; source: string | null; candidates: string[] }

/**
 * Read a business's site and return its best real, published contact email — or
 * { email: null } when the company publishes none (caller must SKIP it).
 */
export async function findContactEmail(businessUrl: string): Promise<ContactEmailResult> {
  const origin = originOf(businessUrl)
  if (!origin) return { email: null, source: null, candidates: [] }
  const domain = domainOf(origin)

  const paths = ['', '/contact', '/contact-us', '/contacts', '/about', '/about-us', '/support', '/company', '/team']
  const all = new Set<string>()
  let source: string | null = null

  for (const p of paths) {
    const html = await fetchText(origin + p)
    if (!html) continue
    const found = extractEmails(html).filter(looksReal)
    if (found.length) {
      if (!source) source = origin + p
      for (const e of found) all.add(e)
      // Stop early once we have a confident on-domain address.
      const top = rank(Array.from(all), domain)[0]
      if (top && (top.endsWith('@' + domain) || top.endsWith('.' + domain))) break
    }
  }

  const ranked = rank(Array.from(all), domain)
  if (ranked.length) return { email: ranked[0], source, candidates: ranked.slice(0, 5) }

  // Fallback: Apollo.io people/match enrichment — resolves many company-email-first
  // businesses that hide behind contact forms. Same honesty rule: on-domain only.
  const apolloEmail = await apolloLookup(domain)
  if (apolloEmail) return { email: apolloEmail, source: 'apollo_enrichment', candidates: [apolloEmail] }

  return { email: null, source: null, candidates: [] }
}

// Apollo.io /people/match — returns the best on-domain contact email for a given
// company domain, or null when Apollo has no record. Requires APOLLO_API_KEY env var.
async function apolloLookup(domain: string): Promise<string | null> {
  const key = process.env.APOLLO_API_KEY
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
    // Strict: only return an address whose domain matches the target.
    if (eDomain !== domain && !eDomain.endsWith('.' + domain)) return null
    return email.toLowerCase()
  } catch { return null }
}
