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

export async function lookupCorpus(input: CorpusLookup): Promise<CorpusLookupResult> {
  const admin = getAdminSupabase()
  const minConfidence = input.minConfidence ?? CORPUS_DEFAULT_MIN_CONFIDENCE
  const domain = normalizeDomain(input.canonicalDomain || input.query)
  let query = admin.from('business_intelligence_corpus').select('*').limit(1)
  if (domain.includes('.')) query = query.eq('canonical_domain', domain)
  else query = query.ilike('company_name', input.query.trim())
  const { data } = await query.maybeSingle()
  if (!data) return { hit: false, sufficient: false, reason: 'not_found' }
  const record = mapRow(data)
  if (record.confidence < minConfidence) return { hit: true, sufficient: false, reason: 'low_confidence', record }
  if ((input.requireFresh ?? true) && !isFresh(record)) return { hit: true, sufficient: false, reason: 'stale', record }
  return { hit: true, sufficient: true, reason: 'internal_hit', record }
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
  if (error || !data) throw new Error(error?.message || 'CORPUS_UPSERT_FAILED')
  return mapRow(data)
}

export async function queueCorpusRefresh(args: { canonicalDomain: string; corpusId?: string; reason: string; priority?: number }) {
  const admin = getAdminSupabase()
  const domain = normalizeDomain(args.canonicalDomain)
  const { data } = await admin.from('business_intelligence_corpus_refresh_queue').select('id').eq('canonical_domain', domain).in('status', ['queued', 'running']).maybeSingle()
  if (data) return
  const { error } = await admin.from('business_intelligence_corpus_refresh_queue').insert({
    corpus_id: args.corpusId || null, canonical_domain: domain, reason: args.reason, priority: args.priority ?? 50,
    status: 'queued', requested_at: new Date().toISOString(),
  })
  if (error && !String(error.message).toLowerCase().includes('duplicate')) throw error
}

export async function corpusCount(): Promise<number> {
  const admin = getAdminSupabase()
  const { count } = await admin.from('business_intelligence_corpus').select('*', { count: 'exact', head: true })
  return count || 0
}
