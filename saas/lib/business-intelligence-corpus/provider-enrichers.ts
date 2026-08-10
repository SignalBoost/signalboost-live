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
  const obj = firstObject(raw)
  if (!obj) return null
  const identifier = obj.identifier || obj.organization || obj.company || obj
  const website = String(obj.website_url || obj.website || obj.url || identifier?.website_url || identifier?.website || lookup.canonicalDomain || '').trim()
  const canonicalDomain = normalizeDomain(website || lookup.canonicalDomain || '')
  if (!canonicalDomain) return null
  const companyName = String(obj.name || obj.companyName || obj.organizationName || identifier?.value || identifier?.name || lookup.query || canonicalDomain).trim()
  const description = String(obj.short_description || obj.description || obj.summary || '').trim() || undefined
  const confidence = clampConfidence(Number(obj.confidence ?? obj.score ?? obj.matchConfidence ?? 0.82))
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
    website: website || `https://${canonicalDomain}`,
    description,
    technologies: Array.isArray(obj.technologies) ? obj.technologies.map(String) : [],
    contacts: [],
    attributes: obj,
    confidence: Math.max(0.6, confidence),
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
