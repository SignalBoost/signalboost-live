// saas/lib/portable/companyIdentity.ts
// THE HOST SIDE of "who does this AI work for" — shared by every portable on this platform.
//
// The platform already knows the company: Enterprise Memory (enterprise_organizations) stores
// name, products_services, value_propositions, brand_voice and positioning. No module should
// make an operator retype that. Portables call this one resolver, so press releases, videos and
// outreach emails all speak for the same employer with the same facts.
//
// A BUYER of any portable replaces this single file (or points it at their own company record).
// That is the whole porting story for company identity.
import { getAdminSupabase } from '@/utils/supabase/server'
import type { CompanyFacts } from '@/portable-kernel'

function splitLines(value?: string | null): string[] {
  return String(value || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
}

function hostnameOf(value?: string | null): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = raw.includes('://') ? raw : `https://${raw}`
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return raw.replace(/^www\./i, '').toLowerCase()
  }
}

// Enterprise Memory stores these as jsonb arrays of strings or objects.
function namesFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item: any) => (typeof item === 'string' ? item : item?.name || item?.title || item?.label || item?.product || ''))
    .map((s: any) => String(s || '').trim())
    .filter(Boolean)
}

function textFrom(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  const obj: any = value
  return String(obj.summary || obj.description || obj.statement || obj.boilerplate || '').trim()
}

let cached: { at: number; facts: CompanyFacts | null } | null = null
const TTL_MS = 60_000

// ── PER-USER identity ──
// A normal user of this platform is NOT the platform. Their outreach, ads, videos and sites must
// carry THEIR company — or a visible gap — never the platform's name. So user content resolves
// from user_company_profile and stops there: no silent inheritance of the operator's brand.
export async function resolveUserCompanyFacts(userId: string): Promise<CompanyFacts | null> {
  const id = String(userId || '').trim()
  if (!id) return null
  const db = (() => { try { return getAdminSupabase() } catch { return null } })()
  if (!db) return null
  try {
    const { data } = await db.from('user_company_profile').select('*').eq('user_id', id).limit(1)
    const row = Array.isArray(data) ? data[0] : null
    if (!row) return null
    return {
      legalName: row.legal_name || undefined,
      brandName: row.brand_name || undefined,
      website: row.website || undefined,
      products: splitLines(row.products),
      boilerplate: row.boilerplate || undefined,
      spokespersonName: row.spokesperson_name || undefined,
      spokespersonTitle: row.spokesperson_title || undefined,
      approvedQuote: row.approved_quote || undefined,
      permittedClaims: splitLines(row.permitted_claims),
      forbiddenClaims: splitLines(row.forbidden_claims),
    }
  } catch {
    return null
  }
}

// Has this user told us who they are? Drives the "add your company" prompt.
export async function userHasCompanyProfile(userId: string): Promise<boolean> {
  const facts = await resolveUserCompanyFacts(userId)
  return Boolean(facts && (facts.brandName || facts.legalName))
}

// THE RULE FOR USER-GENERATED CONTENT: a missing name becomes a visible placeholder, never the
// platform's brand. Use this instead of `input.name || 'SignalBoost...'` anywhere a user's asset
// is being titled, branded, or addressed.
export function contentBrand(facts: CompanyFacts | null | undefined, fallback = '[YOUR COMPANY]'): string {
  const name = String(facts?.brandName || facts?.legalName || '').trim()
  return name || fallback
}

// Identity for a piece of work: a specific user's company when known, otherwise the host's.
// Pass a userId whenever the work belongs to a signed-in user rather than to the platform.
export async function resolveIdentityFor(userId?: string | null): Promise<CompanyFacts | null> {
  const id = String(userId || '').trim()
  if (id) return resolveUserCompanyFacts(id)
  return resolveCompanyFacts()
}

// Resolve the employer. Order: press/press-style overrides (things memory cannot hold, like an
// approved quote) win field by field; the platform's organization record supplies the rest.
export async function resolveCompanyFacts(options?: { force?: boolean }): Promise<CompanyFacts | null> {
  if (!options?.force && cached && Date.now() - cached.at < TTL_MS) return cached.facts

  const db = (() => { try { return getAdminSupabase() } catch { return null } })()
  if (!db) return null

  let override: any = null
  try {
    const { data } = await db.from('press_company_profile').select('*').limit(1)
    override = (Array.isArray(data) ? data[0] : null) || null
  } catch { /* overrides are optional */ }

  let org: any = null
  try {
    const domain = hostnameOf(override?.website)
    const query = db.from('enterprise_organizations').select('*')
    const { data } = domain
      ? await query.eq('canonical_domain', domain).limit(1)
      : await query.order('created_at', { ascending: true }).limit(1)
    org = (Array.isArray(data) ? data[0] : null) || null
  } catch { /* fall back to overrides alone */ }

  if (!org && !override) {
    cached = { at: Date.now(), facts: null }
    return null
  }

  const products = splitLines(override?.products)
  const permitted = splitLines(override?.permitted_claims)
  const facts: CompanyFacts = {
    legalName: override?.legal_name || org?.name || undefined,
    brandName: override?.brand_name || org?.name || (org?.aliases?.[0] ?? undefined),
    website: override?.website || (org?.canonical_domain ? `https://${org.canonical_domain}` : undefined),
    products: products.length ? products : namesFrom(org?.products_services),
    boilerplate: override?.boilerplate || textFrom(org?.brand_positioning) || textFrom(org?.profile) || undefined,
    spokespersonName: override?.spokesperson_name || undefined,
    spokespersonTitle: override?.spokesperson_title || undefined,
    approvedQuote: override?.approved_quote || undefined,
    permittedClaims: permitted.length ? permitted : namesFrom(org?.value_propositions),
    forbiddenClaims: splitLines(override?.forbidden_claims),
  }

  cached = { at: Date.now(), facts }
  return facts
}

// Convenience for synchronous callers that only need the HOST brand (e.g. the platform's own
// mandatory video overlay). PORTABLE_BRAND_NAME lets a buyer set their brand without touching
// code; on the seller's own deployment it is unset and the platform brand applies.
// DO NOT use these for a signed-in user's content — use contentBrand() with their facts.
export function hostBrandName(): string {
  return String(process.env.PORTABLE_BRAND_NAME || '').trim() || 'SignalBoost'
}

export function hostBrandUrl(): string {
  return String(process.env.PORTABLE_BRAND_URL || '').trim() || 'www.' + 'saas.signalboostapp.com'
}
