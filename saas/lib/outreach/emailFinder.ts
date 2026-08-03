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

// INBOXES THAT MUST NEVER RECEIVE COLD SALES, matched on the WHOLE local part rather
// than as a substring, so a real desk like `sales@` or `securityservices@` is untouched.
//
// A real campaign addressed a draft to privacy@ — the inbox a company publishes so
// people can exercise data rights, staffed by whoever answers regulators. A cold sales
// pitch landing there is the single most reliable way to convert a prospect into a
// complaint, and under GDPR it is an unforced error.
//
// The rule already existed. It was applied ONLY to addresses a human SUPPLIED, and the
// comment above it in growthPlans.ts claimed a supplied address "must clear exactly the
// bar a discovered one does" — which was backwards: the discovered path cleared no bar
// at all. This is where discovery gets the same bar, at the point addresses are found.
const ROLE_BLOCKED_LOCALS = new Set([
  'test', 'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'postmaster', 'mailer-daemon',
  // Data protection, legal and security desks — obligation inboxes, not commercial ones.
  'privacy', 'dataprotection', 'data-protection', 'dpo', 'gdpr', 'compliance',
  'legal', 'abuse', 'security', 'infosec', 'soc', 'psirt',
  // Desks staffed for a different purpose entirely; a sales pitch is noise in them.
  'careers', 'jobs', 'recruiting', 'recruitment', 'hr', 'unsubscribe', 'webmaster',
])

function isRoleBlocked(email: string): boolean {
  const local = email.split('@')[0].trim().toLowerCase()
  // Strip a plus-tag so privacy+web@ is caught alongside privacy@.
  return ROLE_BLOCKED_LOCALS.has(local.split('+')[0])
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

  // WHY THIS IS IN WAVES AND NOT A LOOP.
  //
  // These nine pages used to be fetched one after another at 8 seconds each — up to 72
  // seconds to look at one company. The caller caps this work at 25 seconds, so in
  // practice the hunt was killed after about three pages and the last five paths were
  // never read at all. A company that publishes its address on /about or /team was
  // therefore reported as "no published contact email" when the address was sitting
  // right there. The sequential fetch was costing BOTH time and prospects.
  //
  // The pages are independent, so they are fetched together. Wave one holds the paths
  // that carry an address most of the time; wave two only runs when wave one found
  // nothing on-domain, so the common case costs one round trip rather than nine.
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

    // Applied in the wave's declared order, not in whatever order the network
    // happened to answer, so `source` stays deterministic for the same site.
    for (const page of pages) {
      if (!page.html) continue
      const found = extractEmails(page.html).filter(looksReal)
      if (!found.length) continue
      if (!source) source = page.url
      for (const email of found) all.add(email)
    }

    // An on-domain address is a confident answer: stop and skip the next wave.
    const best = rank(Array.from(all), domain)[0]
    if (best) return { email: best, source, candidates: rank(Array.from(all), domain).slice(0, 5) }
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
    // Strict: only return an address whose domain matches the target.
    if (eDomain !== domain && !eDomain.endsWith('.' + domain)) return null
    return email.toLowerCase()
  } catch { return null }
}
