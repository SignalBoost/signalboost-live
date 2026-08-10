import { getAdminSupabase } from '@/utils/supabase/server'
import { normalizeDomain, type BusinessIntelligenceRecord } from './contracts.ts'
import { corpusCount, upsertCorpusRecord } from './service.ts'

const DAY_MS = 86_400_000
const PAGE_SIZE = 1000

function cleanEmail(value: unknown): string | undefined {
  const email = String(value || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(item => String(item || '').trim()).filter(Boolean)
}

function confidenceFromOutreach(row: any) {
  const analyzer = row?.analyzer_summary && typeof row.analyzer_summary === 'object' ? row.analyzer_summary : {}
  const website = row?.website_json && typeof row.website_json === 'object' ? row.website_json : {}
  const explicit = firstNumber(analyzer.confidence, analyzer.confidence_score, website.confidence, website.confidence_score)
  if (explicit !== undefined) return Math.max(0.55, Math.min(0.99, explicit > 1 ? explicit / 100 : explicit))
  let score = 0.58
  if (row?.business_name) score += 0.08
  if (row?.business_url) score += 0.12
  if (cleanEmail(row?.contact_email)) score += 0.06
  if (Object.keys(analyzer).length) score += 0.06
  if (Object.keys(website).length) score += 0.04
  if (row?.status === 'sent' || row?.status === 'approved') score += 0.03
  return Math.min(0.94, score)
}

export function outreachRowToCorpusRecord(row: any): BusinessIntelligenceRecord | null {
  const canonicalDomain = normalizeDomain(String(row?.business_url || ''))
  const companyName = String(row?.business_name || '').trim()
  if (!canonicalDomain || !canonicalDomain.includes('.') || !companyName) return null
  const analyzer = row?.analyzer_summary && typeof row.analyzer_summary === 'object' ? row.analyzer_summary : {}
  const profile = row?.business_model_profile && typeof row.business_model_profile === 'object' ? row.business_model_profile : {}
  const needs = row?.predictive_needs && typeof row.predictive_needs === 'object' ? row.predictive_needs : {}
  const website = row?.website_json && typeof row.website_json === 'object' ? row.website_json : {}
  const createdAt = firstString(row?.created_at) || new Date().toISOString()
  const verifiedAt = firstString(row?.updated_at, row?.sent_at, row?.approved_at, row?.created_at) || createdAt
  const contactEmail = cleanEmail(row?.contact_email)
  return {
    canonicalDomain, companyName, aliases: arrayOfStrings(analyzer.aliases),
    industry: firstString(analyzer.industry, profile.industry, website.industry),
    country: firstString(analyzer.country, profile.country, website.country),
    region: firstString(analyzer.region, profile.region, website.region),
    employeeCount: firstNumber(analyzer.employee_count, analyzer.employeeCount, profile.employee_count, profile.employeeCount),
    revenueUsd: firstNumber(analyzer.revenue_usd, analyzer.revenueUsd, profile.revenue_usd, profile.revenueUsd),
    website: String(row.business_url).trim(),
    description: firstString(analyzer.description, analyzer.summary, profile.description, website.description),
    technologies: [...arrayOfStrings(analyzer.technologies), ...arrayOfStrings(website.technologies), ...arrayOfStrings(profile.technologies)].filter((v, i, a) => a.indexOf(v) === i),
    contacts: contactEmail ? [{ email: contactEmail }] : [],
    attributes: { outreachQueueId: String(row.id || ''), businessId: row.business_id || null, sourcePlatform: row.source_platform || null, outreachStatus: row.status || 'pending', analyzerSummary: analyzer, businessModelProfile: profile, predictiveNeeds: needs, websiteAnalysis: website, reviewStrategy: row.review_strategy || {}, socialPlan: row.social_plan || {}, promoPlan: row.promo_plan || {}, previouslyResearched: true, paidDiscoveryReuse: true },
    confidence: confidenceFromOutreach(row), sourceType: 'learned', sourceIds: [String(row.id || '')].filter(Boolean), verifiedAt, refreshedAt: verifiedAt,
    expiresAt: new Date(Date.parse(verifiedAt) + 90 * DAY_MS).toISOString(),
  }
}

function mergeRecords(current: BusinessIntelligenceRecord, incoming: BusinessIntelligenceRecord): BusinessIntelligenceRecord {
  const contacts = [...current.contacts || [], ...incoming.contacts || []].filter((contact, index, all) => {
    const key = `${contact.email || ''}|${contact.name || ''}|${contact.title || ''}`
    return all.findIndex(other => `${other.email || ''}|${other.name || ''}|${other.title || ''}` === key) === index
  })
  return { ...current, companyName: incoming.companyName || current.companyName, aliases: [...new Set([...(current.aliases || []), ...(incoming.aliases || [])])], industry: incoming.industry || current.industry, country: incoming.country || current.country, region: incoming.region || current.region, employeeCount: incoming.employeeCount ?? current.employeeCount, revenueUsd: incoming.revenueUsd ?? current.revenueUsd, website: incoming.website || current.website, description: incoming.description || current.description, technologies: [...new Set([...(current.technologies || []), ...(incoming.technologies || [])])], contacts, attributes: { ...current.attributes, ...incoming.attributes, outreachHistoryIds: [...new Set([...((current.attributes.outreachHistoryIds as string[] | undefined) || []), ...current.sourceIds, ...incoming.sourceIds])] }, confidence: Math.max(current.confidence, incoming.confidence), sourceIds: [...new Set([...current.sourceIds, ...incoming.sourceIds])], verifiedAt: Date.parse(incoming.verifiedAt) > Date.parse(current.verifiedAt) ? incoming.verifiedAt : current.verifiedAt, refreshedAt: Date.parse(incoming.refreshedAt) > Date.parse(current.refreshedAt) ? incoming.refreshedAt : current.refreshedAt, expiresAt: Date.parse(incoming.expiresAt) > Date.parse(current.expiresAt) ? incoming.expiresAt : current.expiresAt }
}

export async function loadExistingOutreachCorpusRecords() {
  const admin = getAdminSupabase()
  const byDomain = new Map<string, BusinessIntelligenceRecord>()
  let rawRows = 0
  let unusableRows = 0
  for (let from = 0; ; from += PAGE_SIZE) {
    // Select * intentionally: historical deployments have evolved outreach_queue columns.
    // Reading the row shape that actually exists prevents one optional/missing column from
    // aborting reuse of all previously-paid discovery data.
    const { data, error } = await admin.from('outreach_queue').select('*').order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`OUTREACH_HISTORY_READ_FAILED: ${error.message}`)
    const page = data || []
    rawRows += page.length
    for (const row of page) {
      const record = outreachRowToCorpusRecord(row)
      if (!record) { unusableRows += 1; continue }
      const existing = byDomain.get(record.canonicalDomain)
      byDomain.set(record.canonicalDomain, existing ? mergeRecords(existing, record) : record)
    }
    if (page.length < PAGE_SIZE) break
  }
  return { rawRows, unusableRows, records: [...byDomain.values()] }
}

export async function seedCorpusFromExistingOutreachHistory() {
  const loaded = await loadExistingOutreachCorpusRecords()
  const before = await corpusCount()
  let succeeded = 0
  const failures: Array<{ canonicalDomain: string; companyName: string; error: string }> = []
  for (const record of loaded.records) {
    try { await upsertCorpusRecord(record); succeeded += 1 }
    catch (error) { failures.push({ canonicalDomain: record.canonicalDomain, companyName: record.companyName, error: error instanceof Error ? error.message : String(error) }) }
  }
  const after = await corpusCount()
  return { source: 'outreach_queue', rawOutreachRows: loaded.rawRows, uniqueCompanies: loaded.records.length, unusableRows: loaded.unusableRows, attempted: loaded.records.length, succeeded, failed: failures.length, failures: failures.slice(0, 50), before, after, netAdded: Math.max(0, after - before), providerCalls: 0, externalAiCalls: 0, strategy: 'reuse_existing_paid_discovery_first' }
}
