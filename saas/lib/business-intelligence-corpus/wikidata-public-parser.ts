import { normalizeDomain } from './contracts.ts'

export type WikidataCompanyCandidate = Readonly<{
  qid: string
  itemUrl: string
  companyName: string
  canonicalDomain: string
  website: string
  country?: string
  industry?: string
}>

export type WikidataSparqlBinding = Record<string, { type?: string; value?: string } | undefined>

function qidFromItem(value: string): string {
  const match = value.match(/\/entity\/(Q\d+)$/i)
  return match?.[1]?.toUpperCase() || ''
}

function cleanWebsite(value: string): { website: string; domain: string } | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const domain = normalizeDomain(url.hostname)
    if (!domain || !domain.includes('.')) return null
    return { website: url.toString(), domain }
  } catch {
    return null
  }
}

export function parseWikidataCompanyBindings(bindings: readonly WikidataSparqlBinding[]): WikidataCompanyCandidate[] {
  const byDomain = new Map<string, WikidataCompanyCandidate>()
  for (const binding of bindings) {
    const itemUrl = String(binding.item?.value || '').trim()
    const qid = qidFromItem(itemUrl)
    const companyName = String(binding.itemLabel?.value || '').replace(/\s+/g, ' ').trim()
    const site = cleanWebsite(String(binding.website?.value || '').trim())
    if (!qid || !site || !companyName || companyName.toUpperCase() === qid) continue
    if (companyName.length < 2 || companyName.length > 160) continue

    const candidate: WikidataCompanyCandidate = {
      qid,
      itemUrl,
      companyName,
      canonicalDomain: site.domain,
      website: site.website,
      country: String(binding.countryLabel?.value || '').replace(/\s+/g, ' ').trim() || undefined,
      industry: String(binding.industryLabel?.value || '').replace(/\s+/g, ' ').trim() || undefined,
    }
    const existing = byDomain.get(site.domain)
    if (!existing || candidate.companyName.length < existing.companyName.length) byDomain.set(site.domain, candidate)
  }
  return [...byDomain.values()].sort((a, b) => a.qid.localeCompare(b.qid, undefined, { numeric: true }))
}
