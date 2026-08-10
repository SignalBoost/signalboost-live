import { getAdminSupabase } from '@/utils/supabase/server'
import {
  CORPUS_DEFAULT_MIN_CONFIDENCE,
  CORPUS_DEFAULT_TTL_DAYS,
  clampConfidence,
  isFresh,
  normalizeDomain,
  type BusinessIntelligenceRecord,
  type CorpusLookup,
  type CorpusLookupResult,
} from './contracts.ts'
import { isMissingCorpusTable } from './storage.ts'

const FALLBACK_PROFILE_KEY = 'businessIntelligenceCorpus'
const FALLBACK_COUNT_PAGE_SIZE = 1000

function mapRow(row: any): BusinessIntelligenceRecord {
  return {
    id: row.id,
    canonicalDomain: row.canonical_domain,
    companyName: row.company_name || '',
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    industry: row.industry || undefined,
    country: row.country || undefined,
    region: row.region || undefined,
    employeeCount: row.employee_count == null ? undefined : Number(row.employee_count),
    revenueUsd: row.revenue_usd == null ? undefined : Number(row.revenue_usd),
    website: row.website || undefined,
    description: row.description || undefined,
    technologies: Array.isArray(row.technologies) ? row.technologies : [],
    contacts: Array.isArray(row.contacts) ? row.contacts : [],
    attributes: row.attributes || {},
    confidence: clampConfidence(Number(row.confidence) || 0),
    sourceType: row.source_type || 'curated',
    sourceIds: Array.isArray(row.source_ids) ? row.source_ids : [],
    verifiedAt: row.verified_at,
    refreshedAt: row.refreshed_at,
    expiresAt: row.expires_at,
  }
}

function mapEnterpriseFallback(row: any): BusinessIntelligenceRecord | null {
  const stored = row?.profile?.[FALLBACK_PROFILE_KEY]
  if (!stored || typeof stored !== 'object') return null
  return {
    id: row.id,
    canonicalDomain: normalizeDomain(stored.canonicalDomain || row.canonical_domain || ''),
    companyName: stored.companyName || row.name || '',
    aliases: Array.isArray(stored.aliases) ? stored.aliases : Array.isArray(row.aliases) ? row.aliases : [],
    industry: stored.industry || row.industry || undefined,
    country: stored.country || undefined,
    region: stored.region || undefined,
    employeeCount: stored.employeeCount == null ? undefined : Number(stored.employeeCount),
    revenueUsd: stored.revenueUsd == null ? undefined : Number(stored.revenueUsd),
    website: stored.website || undefined,
    description: stored.description || undefined,
    technologies: Array.isArray(stored.technologies) ? stored.technologies : [],
    contacts: Array.isArray(stored.contacts) ? stored.contacts : [],
    attributes: stored.attributes || {},
    confidence: clampConfidence(Number(stored.confidence) || Number(row.confidence) || 0),
    sourceType: stored.sourceType || 'enterprise_memory',
    sourceIds: Array.isArray(stored.sourceIds) ? stored.sourceIds : [],
    verifiedAt: stored.verifiedAt || row.profile_refreshed_at || row.updated_at,
    refreshedAt: stored.refreshedAt || row.profile_refreshed_at || row.updated_at,
    expiresAt: stored.expiresAt || new Date(Date.now() + CORPUS_DEFAULT_TTL_DAYS * 86400000).toISOString(),
  }
}

function toFallbackPayload(record: BusinessIntelligenceRecord, now: string) {
  return {
    canonicalDomain: normalizeDomain(record.canonicalDomain || record.website || ''),
    companyName: record.companyName.trim(),
    aliases: [...new Set(record.aliases)],
    industry: record.industry || null,
    country: record.country || null,
    region: record.region || null,
    employeeCount: record.employeeCount ?? null,
    revenueUsd: record.revenueUsd ?? null,
    website: record.website || null,
    description: record.description || null,
    technologies: record.technologies || [],
    contacts: record.contacts || [],
    attributes: record.attributes || {},
    confidence: clampConfidence(record.confidence),
    sourceType: record.sourceType,
    sourceIds: [...new Set(record.sourceIds)],
    verifiedAt: record.verifiedAt || now,
    refreshedAt: now,
    expiresAt: record.expiresAt || new Date(Date.now() + CORPUS_DEFAULT_TTL_DAYS * 86400000).toISOString(),
  }
}

async function lookupEnterpriseFallback(input: CorpusLookup): Promise<CorpusLookupResult> {
  const admin = getAdminSupabase()
  const domain = normalizeDomain(input.canonicalDomain || input.query)
  let query = admin.from('enterprise_organizations').select('*').limit(1)
  if (domain.includes('.')) query = query.eq('canonical_domain', domain)
  else query = query.ilike('name', input.query.trim())
  const { data, error } = await query.maybeSingle()
  if (error || !data) return { hit: false, sufficient: false, reason: 'not_found' }
  const record = mapEnterpriseFallback(data)
  if (!record) return { hit: false, sufficient: false, reason: 'not_found' }
  const minConfidence = input.minConfidence ?? CORPUS_DEFAULT_MIN_CONFIDENCE
  if (record.confidence < minConfidence) return { hit: true, sufficient: false, reason: 'low_confidence', record }
  if ((input.requireFresh ?? true) && !isFresh(record)) return { hit: true, sufficient: false, reason: 'stale', record }
  return { hit: true, sufficient: true, reason: 'internal_hit', record }
}

export async function lookupCorpus(input: CorpusLookup): Promise<CorpusLookupResult> {
  const admin = getAdminSupabase()
  const minConfidence = input.minConfidence ?? CORPUS_DEFAULT_MIN_CONFIDENCE
  const domain = normalizeDomain(input.canonicalDomain || input.query)
  let query = admin.from('business_intelligence_corpus').select('*').limit(1)
  if (domain.includes('.')) query = query.eq('canonical_domain', domain)
  else query = query.ilike('company_name', input.query.trim())
  const { data, error } = await query.maybeSingle()
  if (error) {
    if (isMissingCorpusTable(error)) return lookupEnterpriseFallback(input)
    return { hit: false, sufficient: false, reason: 'not_found' }
  }
  if (!data) return { hit: false, sufficient: false, reason: 'not_found' }
  const record = mapRow(data)
  if (record.confidence < minConfidence) return { hit: true, sufficient: false, reason: 'low_confidence', record }
  if ((input.requireFresh ?? true) && !isFresh(record)) return { hit: true, sufficient: false, reason: 'stale', record }
  return { hit: true, sufficient: true, reason: 'internal_hit', record }
}

async function upsertEnterpriseFallback(record: BusinessIntelligenceRecord): Promise<BusinessIntelligenceRecord> {
  const admin = getAdminSupabase()
  const domain = normalizeDomain(record.canonicalDomain || record.website || '')
  if (!domain) throw new Error('CORPUS_CANONICAL_DOMAIN_REQUIRED')
  const now = new Date().toISOString()
  const { data: existing, error: readError } = await admin.from('enterprise_organizations').select('*').eq('canonical_domain', domain).maybeSingle()
  if (readError) throw new Error(`CORPUS_ENTERPRISE_MEMORY_READ_FAILED: ${readError.message}`)
  const profile = existing?.profile && typeof existing.profile === 'object' ? existing.profile : {}
  const stored = toFallbackPayload(record, now)
  const payload = {
    canonical_domain: domain,
    name: record.companyName.trim(),
    aliases: [...new Set(record.aliases)],
    source_type: existing?.source_type || 'learned',
    industry: record.industry || existing?.industry || '',
    profile: { ...profile, [FALLBACK_PROFILE_KEY]: stored },
    confidence: Math.max(Number(existing?.confidence) || 0, clampConfidence(record.confidence)),
    profile_refreshed_at: now,
    updated_at: now,
  }
  const { data, error } = await admin.from('enterprise_organizations').upsert(payload, { onConflict: 'canonical_domain' }).select('*').single()
  if (error || !data) throw new Error(error?.message || 'CORPUS_ENTERPRISE_MEMORY_UPSERT_FAILED')
  const mapped = mapEnterpriseFallback(data)
  if (!mapped) throw new Error('CORPUS_ENTERPRISE_MEMORY_MAP_FAILED')
  return mapped
}

export async function upsertCorpusRecord(record: BusinessIntelligenceRecord): Promise<BusinessIntelligenceRecord> {
  const admin = getAdminSupabase()
  const domain = normalizeDomain(record.canonicalDomain || record.website || '')
  if (!domain) throw new Error('CORPUS_CANONICAL_DOMAIN_REQUIRED')
  const now = new Date().toISOString()
  const payload = {
    canonical_domain: domain,
    company_name: record.companyName.trim(), aliases: [...new Set(record.aliases)], industry: record.industry || null,
    country: record.country || null, region: record.region || null, employee_count: record.employeeCount ?? null,
    revenue_usd: record.revenueUsd ?? null, website: record.website || `https://${domain}`, description: record.description || null,
    technologies: record.technologies || [], contacts: record.contacts || [], attributes: record.attributes || {},
    confidence: clampConfidence(record.confidence), source_type: record.sourceType, source_ids: [...new Set(record.sourceIds)],
    verified_at: record.verifiedAt || now, refreshed_at: now,
    expires_at: record.expiresAt || new Date(Date.now() + CORPUS_DEFAULT_TTL_DAYS * 86400000).toISOString(), updated_at: now,
  }
  const { data, error } = await admin.from('business_intelligence_corpus').upsert(payload, { onConflict: 'canonical_domain' }).select('*').single()
  if (error || !data) {
    if (isMissingCorpusTable(error)) return upsertEnterpriseFallback(record)
    throw new Error(error?.message || 'CORPUS_UPSERT_FAILED')
  }
  return mapRow(data)
}

export async function queueCorpusRefresh(args: { canonicalDomain: string; corpusId?: string; reason: string; priority?: number }) {
  const admin = getAdminSupabase()
  const domain = normalizeDomain(args.canonicalDomain)
  const { data, error: lookupError } = await admin.from('business_intelligence_corpus_refresh_queue').select('id').eq('canonical_domain', domain).in('status', ['queued', 'running']).maybeSingle()
  if (lookupError && isMissingCorpusTable(lookupError)) return
  if (data) return
  const { error } = await admin.from('business_intelligence_corpus_refresh_queue').insert({ corpus_id: args.corpusId || null, canonical_domain: domain, reason: args.reason, priority: args.priority ?? 50, status: 'queued', requested_at: new Date().toISOString() })
  if (error && !String(error.message).toLowerCase().includes('duplicate')) {
    if (isMissingCorpusTable(error)) return
    throw error
  }
}

async function countEnterpriseFallbackCorpus(): Promise<number> {
  const admin = getAdminSupabase()

  // Prefer an exact server-side JSON-path count so corpus size is independent of
  // the total Enterprise Memory population and does not stop at an arbitrary row cap.
  const filtered = await admin
    .from('enterprise_organizations')
    .select('id', { count: 'exact', head: true })
    .not(`profile->${FALLBACK_PROFILE_KEY}`, 'is', null)
  if (!filtered.error && filtered.count != null) return filtered.count

  // Older PostgREST deployments may reject JSON-path filters. Fall back to complete
  // pagination rather than the old 10,000-row cap that could report 0 despite
  // successfully persisted corpus records being later in the table.
  let total = 0
  for (let from = 0; ; from += FALLBACK_COUNT_PAGE_SIZE) {
    const { data, error } = await admin
      .from('enterprise_organizations')
      .select('id,profile')
      .range(from, from + FALLBACK_COUNT_PAGE_SIZE - 1)
    if (error) return total
    const page = data || []
    total += page.filter(row => row?.profile?.[FALLBACK_PROFILE_KEY]).length
    if (page.length < FALLBACK_COUNT_PAGE_SIZE) break
  }
  return total
}

export async function corpusCount(): Promise<number> {
  const admin = getAdminSupabase()
  const primary = await admin.from('business_intelligence_corpus').select('*', { count: 'exact', head: true })
  if (!primary.error) return primary.count || 0
  if (!isMissingCorpusTable(primary.error)) return 0
  return countEnterpriseFallbackCorpus()
}
