type FetchLike = typeof fetch

export type DomainLookup = {
  domain: string
  status: 'registered' | 'no_registration_found' | 'unknown'
  checkedAt: string
  registryEndpoint: string | null
  detail: string
}

type Bootstrap = { services?: Array<[string[], string[]]> }

const DOMAIN = /(?<![\w@])(?:https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})(?![\w.-])/gi
const INTENT = /\b(?:domain|url|tld|registrar|rdap|whois|availability|available|registered|taken|purchase|buy)\b/i
let cachedBootstrap: { value: Bootstrap; expiresAt: number } | null = null

export function extractDomainCandidates(input: string, context = ''): string[] {
  if (!INTENT.test(input)) return []
  const found: string[] = []
  for (const match of `${input}\n${context}`.matchAll(DOMAIN)) {
    const value = String(match[1] || '').toLowerCase().replace(/\.$/, '')
    if (value && !found.includes(value)) found.push(value)
    if (found.length >= 10) break
  }
  return found
}

async function bootstrap(fetchImpl: FetchLike): Promise<Bootstrap> {
  if (cachedBootstrap && cachedBootstrap.expiresAt > Date.now()) return cachedBootstrap.value
  const response = await fetchImpl('https://data.iana.org/rdap/dns.json', {
    headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`IANA RDAP bootstrap failed (${response.status})`)
  const value = await response.json() as Bootstrap
  cachedBootstrap = { value, expiresAt: Date.now() + 24 * 60 * 60 * 1000 }
  return value
}

function endpointFor(domain: string, data: Bootstrap): string | null {
  const tld = domain.split('.').at(-1)
  if (!tld) return null
  for (const service of data.services || []) {
    if (!Array.isArray(service) || !service[0]?.map(String).map(v => v.toLowerCase()).includes(tld)) continue
    const endpoint = service[1]?.find(value => String(value).startsWith('https://'))
    return endpoint ? String(endpoint) : null
  }
  return null
}

export async function lookupDomainsRdap(domains: string[], fetchImpl: FetchLike = fetch): Promise<DomainLookup[]> {
  const checkedAt = new Date().toISOString()
  let data: Bootstrap
  try { data = await bootstrap(fetchImpl) }
  catch (error) {
    return domains.map(domain => ({ domain, status: 'unknown', checkedAt, registryEndpoint: null, detail: error instanceof Error ? error.message : 'IANA RDAP bootstrap unavailable' }))
  }
  return Promise.all(domains.map(async domain => {
    const endpoint = endpointFor(domain, data)
    if (!endpoint) return { domain, status: 'unknown' as const, checkedAt, registryEndpoint: null, detail: 'This TLD has no RDAP service in the IANA bootstrap registry.' }
    const url = `${endpoint.replace(/\/$/, '')}/domain/${encodeURIComponent(domain)}`
    try {
      const response = await fetchImpl(url, { headers: { Accept: 'application/rdap+json, application/json' }, cache: 'no-store', signal: AbortSignal.timeout(12_000), redirect: 'follow' })
      if (response.ok) return { domain, status: 'registered' as const, checkedAt, registryEndpoint: endpoint, detail: 'The authoritative RDAP service returned a domain registration record.' }
      if (response.status === 404) return { domain, status: 'no_registration_found' as const, checkedAt, registryEndpoint: endpoint, detail: 'No registration record was found in authoritative RDAP. A registrar must still confirm that it is purchasable and whether it is reserved or premium.' }
      return { domain, status: 'unknown' as const, checkedAt, registryEndpoint: endpoint, detail: `The authoritative RDAP service returned HTTP ${response.status}.` }
    } catch (error) {
      return { domain, status: 'unknown' as const, checkedAt, registryEndpoint: endpoint, detail: error instanceof Error ? error.message : 'RDAP request failed.' }
    }
  }))
}

export function renderDomainLookups(results: DomainLookup[]): string {
  const lines = results.map(result => {
    const label = result.status === 'registered' ? 'REGISTERED'
      : result.status === 'no_registration_found' ? 'NO REGISTRATION FOUND'
        : 'UNVERIFIED'
    return `- ${result.domain}: ${label} — ${result.detail}`
  })
  return [`Live domain check (${results[0]?.checkedAt || new Date().toISOString()}):`, ...lines, '', '“No registration found” is not a purchase guarantee; reserved, premium, and registrar policy checks occur at checkout.'].join('\n')
}

export async function tryDomainAvailabilityLookup(args: { input: string; context?: string; fetchImpl?: FetchLike }) {
  const domains = extractDomainCandidates(args.input, args.context)
  if (!domains.length) return null
  const results = await lookupDomainsRdap(domains, args.fetchImpl)
  return { results, reply: renderDomainLookups(results) }
}
