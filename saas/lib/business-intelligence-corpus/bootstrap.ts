import { getAdminSupabase } from '@/utils/supabase/server'
import { CORPUS_TARGET_RECORDS, clampConfidence, normalizeDomain, type BusinessIntelligenceRecord } from './contracts.ts'
import { corpusCount, upsertCorpusRecord } from './service.ts'
import { persistCorpusIntelligence } from './integration.ts'

export type CorpusBootstrapReport = Readonly<{
  target: number
  before: number
  imported: number
  after: number
  remaining: number
}>

/**
 * Seed the proprietary corpus from intelligence SignalBoost already owns before buying anything new.
 * This intentionally reads Enterprise Memory first and only fills the remaining gap through later
 * provider enrichment/discovery jobs.
 */
export async function bootstrapCorpusFromEnterpriseMemory(limit = CORPUS_TARGET_RECORDS): Promise<CorpusBootstrapReport> {
  const before = await corpusCount()
  const remainingCapacity = Math.max(0, Math.min(limit, CORPUS_TARGET_RECORDS - before))
  if (!remainingCapacity) return { target: CORPUS_TARGET_RECORDS, before, imported: 0, after: before, remaining: 0 }

  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from('enterprise_organizations')
    .select('canonical_domain,name,aliases,industry,profile,confidence,source_type,profile_refreshed_at')
    .order('confidence', { ascending: false })
    .limit(remainingCapacity)
  if (error) throw new Error(error.message)

  let imported = 0
  for (const row of data ?? []) {
    const domain = normalizeDomain(row.canonical_domain || '')
    if (!domain) continue
    const profile = (row.profile || {}) as Record<string, any>
    const refreshedAt = row.profile_refreshed_at || new Date().toISOString()
    const record: BusinessIntelligenceRecord = {
      canonicalDomain: domain,
      companyName: row.name || profile.companyName || profile.name || domain,
      aliases: Array.isArray(row.aliases) ? row.aliases : [],
      industry: row.industry || profile.industry || undefined,
      country: profile.country || undefined,
      region: profile.region || undefined,
      employeeCount: Number.isFinite(Number(profile.employeeCount)) ? Number(profile.employeeCount) : undefined,
      revenueUsd: Number.isFinite(Number(profile.revenueUsd)) ? Number(profile.revenueUsd) : undefined,
      website: profile.website || `https://${domain}`,
      description: profile.description || undefined,
      technologies: Array.isArray(profile.technologies) ? profile.technologies : [],
      contacts: Array.isArray(profile.contacts) ? profile.contacts : [],
      attributes: profile,
      confidence: clampConfidence(Number(row.confidence) || 0.65),
      sourceType: 'enterprise_memory',
      sourceIds: [row.source_type || 'enterprise_memory'],
      verifiedAt: refreshedAt,
      refreshedAt,
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    }
    const saved = await upsertCorpusRecord(record)
    await persistCorpusIntelligence({ record: saved })
    imported += 1
  }

  const after = await corpusCount()
  return { target: CORPUS_TARGET_RECORDS, before, imported, after, remaining: Math.max(0, CORPUS_TARGET_RECORDS - after) }
}
