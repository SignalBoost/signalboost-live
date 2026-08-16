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

type ParsedWebsite = Readonly<{
  website: string
  domain: string
  pathPenalty: number
  domainLength: number
  urlLength: number
}>

function qidFromItem(value: string): string {
  const match = value.match(/\/entity\/(Q\d+)$/i)
  return match?.[1]?.toUpperCase() || ''
}

function cleanWebsite(value: string): ParsedWebsite | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const domain = normalizeDomain(url.hostname)
    if (!domain || !domain.includes('.')) return null
    return {
      website: url.toString(),
      domain,
      pathPenalty: url.pathname && url.pathname !== '/' ? 1 : 0,
      domainLength: domain.length,
      urlLength: url.toString().length,
    }
  } catch {
    return null
  }
}

function websiteRank(a: ParsedWebsite, b: ParsedWebsite): number {
  return a.pathPenalty - b.pathPenalty || a.domainLength - b.domainLength || a.urlLength - b.urlLength || a.domain.localeCompare(b.domain)
}

export function parseWikidataCompanyBindings(bindings: readonly WikidataSparqlBinding[]): WikidataCompanyCandidate[] {
  const byQid = new Map<string, { candidate: WikidataCompanyCandidate; site: ParsedWebsite }>()

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

    const existing = byQid.get(qid)
    if (!existing || websiteRank(site, existing.site) < 0) byQid.set(qid, { candidate, site })
  }

  const byDomain = new Map<string, WikidataCompanyCandidate>()
  for (const { candidate } of byQid.values()) {
    const existing = byDomain.get(candidate.canonicalDomain)
    if (!existing || candidate.qid.localeCompare(existing.qid, undefined, { numeric: true }) < 0) {
      byDomain.set(candidate.canonicalDomain, candidate)
    }
  }

  return [...byDomain.values()].sort((a, b) => a.qid.localeCompare(b.qid, undefined, { numeric: true }))
}
