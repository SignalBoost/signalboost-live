import { availableProspectProviders, runProspectProvider } from '@/lib/prospect-intelligence/provider-service.ts'
import type { ProspectProviderContext } from '@/lib/prospect-intelligence/contracts.ts'
import { clampConfidence, normalizeDomain, type BusinessIntelligenceRecord, type CorpusLookup } from './contracts.ts'
import type { CorpusProviderEnricher } from './orchestrator.ts'

function firstObject(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) return value.find(item => item && typeof item === 'object') as Record<string, any> || null
  const obj = value as Record<string, any>
  for (const key of ['data', 'results', 'entities', 'organizations', 'companies', 'items']) {
    const nested = obj[key]
    if (Array.isArray(nested) && nested.length) return firstObject(nested)
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) return firstObject(nested)
  }
  return obj
}

function normalizeProviderRecord(raw: unknown, lookup: CorpusLookup, providerId: string): BusinessIntelligenceRecord | null {
  const root = firstObject(raw)
  if (!root) return null
  const obj = root.properties && typeof root.properties === 'object' && !Array.isArray(root.properties)
    ? { ...root, ...root.properties }
    : root
  const identifier = obj.identifier || obj.organization || obj.company || obj
  const providerWebsite = String(obj.website_url || obj.website || obj.domain || obj.url || identifier?.website_url || identifier?.website || identifier?.domain || '').trim()
  const providerDomain = normalizeDomain(providerWebsite)
  const providerName = String(obj.name || obj.companyName || obj.organizationName || identifier?.value || identifier?.name || '').trim()
  const providerEvidence = Boolean(providerDomain || providerName)
  if (!providerEvidence) return null

  const lookupDomain = normalizeDomain(lookup.canonicalDomain || '')
  const canonicalDomain = providerDomain || lookupDomain
  if (!canonicalDomain) return null

  const exactDomainMatch = Boolean(providerDomain && lookupDomain && providerDomain === lookupDomain)
  const companyName = providerName || String(lookup.query || canonicalDomain).trim()
  const description = String(obj.short_description || obj.description || obj.summary || '').trim() || undefined
  const reportedConfidence = Number(obj.confidence ?? obj.score ?? obj.matchConfidence)
  const confidence = Number.isFinite(reportedConfidence)
    ? clampConfidence(reportedConfidence)
    : exactDomainMatch ? 0.82 : 0.72
  const now = new Date().toISOString()
  return {
    canonicalDomain,
    companyName,
    aliases: [],
    industry: String(obj.industry || obj.primaryIndustry || obj.category || '').trim() || undefined,
    country: String(obj.country || obj.countryCode || obj.location?.country || '').trim() || undefined,
    region: String(obj.region || obj.state || obj.location?.region || '').trim() || undefined,
    employeeCount: Number.isFinite(Number(obj.employeeCount ?? obj.numberOfEmployees ?? obj.employees)) ? Number(obj.employeeCount ?? obj.numberOfEmployees ?? obj.employees) : undefined,
    revenueUsd: Number.isFinite(Number(obj.revenueUsd ?? obj.revenue ?? obj.annualRevenue)) ? Number(obj.revenueUsd ?? obj.revenue ?? obj.annualRevenue) : undefined,
    website: providerWebsite || `https://${canonicalDomain}`,
    description,
    technologies: Array.isArray(obj.technologies) ? obj.technologies.map(String) : [],
    contacts: [],
    attributes: obj,
    confidence,
    sourceType: 'provider',
    sourceIds: [providerId],
    verifiedAt: now,
    refreshedAt: now,
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  }
}

export function configuredCorpusProviderEnrichers(context?: Partial<ProspectProviderContext>): CorpusProviderEnricher[] {
  const ctx: ProspectProviderContext = {
    connectionId: context?.connectionId || 'business-intelligence-corpus',
    secretReferences: context?.secretReferences || [],
    locale: context?.locale || 'en',
  }
  return availableProspectProviders()
    .filter(provider => provider.capabilities.includes('company_profile') || provider.capabilities.includes('company_search'))
    .map(provider => async (lookup: CorpusLookup) => {
      const capability = provider.capabilities.includes('company_profile') ? 'company_profile' as const : 'company_search' as const
      const result = await runProspectProvider<Record<string, unknown>, unknown>({
        providerId: provider.providerId,
        capability,
        input: { name: lookup.query, company: lookup.query, domain: lookup.canonicalDomain, website: lookup.canonicalDomain },
        context: ctx,
      })
      return { providerId: provider.providerId, record: result.ok ? normalizeProviderRecord(result.data, lookup, provider.providerId) : null }
    })
}
