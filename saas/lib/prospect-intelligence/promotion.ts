import curated from '@/data/prospects.json'
import { getAdminSupabase } from '@/utils/supabase/server'

type CuratedRecord = {
  id: string
  company: string
  country: string
  website: string
  email: string
  industry: string
  technicalFit: number
  revenuePotential: number
  status: string
}

export type PromotionCandidate = CuratedRecord & {
  organizationId: string
  canonicalDomain: string
  confidence: number
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function countryFromProfile(profile: Record<string, unknown>) {
  return text(profile.countryCode || profile.country || profile.region).toUpperCase()
}

function websiteFor(domain: string, profile: Record<string, unknown>) {
  return text(profile.website || profile.websiteUrl) || `https://${domain}/`
}

function emailDomain(email: string) {
  return email.toLowerCase().split('@')[1] || ''
}

function existingDomains() {
  const rows = Array.isArray(curated.prospects) ? curated.prospects as CuratedRecord[] : []
  return new Set(rows.map(row => {
    try { return new URL(row.website).hostname.replace(/^www\./, '').toLowerCase() }
    catch { return '' }
  }).filter(Boolean))
}

export async function selectEnterpriseMemoryPromotionCandidates(args: {
  minimumConfidence?: number
  minimumTechnicalFit?: number
  minimumRevenuePotential?: number
  limit?: number
} = {}): Promise<PromotionCandidate[]> {
  const admin = getAdminSupabase()
  const minimumConfidence = args.minimumConfidence ?? 0.7
  const minimumTechnicalFit = args.minimumTechnicalFit ?? 70
  const minimumRevenuePotential = args.minimumRevenuePotential ?? 60
  const limit = Math.max(1, Math.min(5000, Math.trunc(args.limit ?? 500)))
  const alreadyCurated = existingDomains()

  const { data: orgs, error: orgError } = await admin
    .from('enterprise_organizations')
    .select('id,canonical_domain,name,industry,profile,confidence,status')
    .in('status', ['fresh','partial'])
    .gte('confidence', minimumConfidence)
    .limit(limit * 4)
  if (orgError) throw new Error(orgError.message)

  const results: PromotionCandidate[] = []
  for (const org of orgs || []) {
    const domain = text(org.canonical_domain).toLowerCase()
    if (!domain || alreadyCurated.has(domain)) continue

    const { data: contacts } = await admin
      .from('prospect_contacts')
      .select('business_email,verification_status,confidence')
      .eq('organization_id', org.id)
      .eq('verification_status', 'verified')
      .order('confidence', { ascending: false })
      .limit(5)

    const verifiedEmail = (contacts || [])
      .map(row => text(row.business_email).toLowerCase())
      .find(email => email && emailDomain(email) === domain)
      || (contacts || []).map(row => text(row.business_email).toLowerCase()).find(Boolean)
      || ''
    if (!verifiedEmail) continue

    const { data: hot } = await admin
      .from('prospect_hot_pool')
      .select('technical_fit,revenue_potential,status')
      .eq('organization_id', org.id)
      .maybeSingle()

    const technicalFit = number(hot?.technical_fit)
    const revenuePotential = number(hot?.revenue_potential)
    if (technicalFit < minimumTechnicalFit || revenuePotential < minimumRevenuePotential) continue

    const profile = (org.profile && typeof org.profile === 'object' && !Array.isArray(org.profile))
      ? org.profile as Record<string, unknown>
      : {}

    results.push({
      organizationId: org.id,
      canonicalDomain: domain,
      id: `EM-${org.id}`,
      company: text(org.name) || domain,
      country: countryFromProfile(profile),
      website: websiteFor(domain, profile),
      email: verifiedEmail,
      industry: text(org.industry),
      technicalFit,
      revenuePotential,
      confidence: number(org.confidence),
      status: 'READY',
    })
  }

  return results
    .sort((a, b) => (b.technicalFit + b.revenuePotential + b.confidence * 100) - (a.technicalFit + a.revenuePotential + a.confidence * 100))
    .slice(0, limit)
}

export function mergeCuratedSnapshot(existing: readonly CuratedRecord[], candidates: readonly PromotionCandidate[]): CuratedRecord[] {
  const byDomain = new Map<string, CuratedRecord>()
  const put = (row: CuratedRecord) => {
    let domain = ''
    try { domain = new URL(row.website).hostname.replace(/^www\./, '').toLowerCase() } catch {}
    if (!domain) return
    const previous = byDomain.get(domain)
    if (!previous || (row.technicalFit + row.revenuePotential) > (previous.technicalFit + previous.revenuePotential)) byDomain.set(domain, row)
  }
  existing.forEach(put)
  candidates.forEach(put)
  return [...byDomain.values()].sort((a, b) => (b.technicalFit + b.revenuePotential) - (a.technicalFit + a.revenuePotential))
}
