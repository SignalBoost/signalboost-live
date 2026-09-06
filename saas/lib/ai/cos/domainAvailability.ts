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
const BRAINSTORM = /\b(?:brainstorm|suggest|suggestion|ideas?|names?|naming|brand|creative)\b/i
const PLATFORM = /\b(?:platform|software|developer|development|coding|code|saas|app|product|domain|url)\b/i
let cachedBootstrap: { value: Bootstrap; expiresAt: number } | null = null

export type DomainSuggestion = { name: string; domain: string; meaning: string }

export function isDomainBrainstormRequest(input: string, context = ''): boolean {
  const combined = `${input}\n${context}`
  return BRAINSTORM.test(input) && PLATFORM.test(combined)
}

function requestedSuggestionCount(input: string): number {
  const explicit = input.match(/\b(\d{1,2})\s+(?:domain\s+)?(?:suggestions?|ideas?|names?)/i)?.[1]
  return Math.max(1, Math.min(20, Number(explicit || 15)))
}

export function parseGeneratedDomainSuggestions(raw: string, excludeLegacyWords: boolean): DomainSuggestion[] {
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}')
  const object = start >= 0 && end > start ? raw.slice(start, end + 1) : null
  if (!object) return []
  try {
    const parsed = JSON.parse(object) as { candidates?: unknown }
    const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : []
    const out: DomainSuggestion[] = []
    for (const item of candidates) {
      const value = item as Record<string, unknown>
      const name = String(value?.name || '').replace(/[^a-z0-9 -]/gi, '').trim().slice(0, 40)
      const domain = String(value?.domain || '').trim().toLowerCase()
      const meaning = String(value?.meaning || '').replace(/\s+/g, ' ').trim().slice(0, 180)
      if (!name || !/^[a-z0-9][a-z0-9-]{1,62}\.(?:com|ai|dev|app|io)$/.test(domain) || !meaning) continue
      if (excludeLegacyWords && /signal|boost/i.test(`${name} ${domain}`)) continue
      if (!out.some(candidate => candidate.domain === domain)) out.push({ name, domain, meaning })
    }
    return out.slice(0, 50)
  } catch { return [] }
}

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
  if (fetchImpl === fetch && cachedBootstrap && cachedBootstrap.expiresAt > Date.now()) return cachedBootstrap.value
  const response = await fetchImpl('https://data.iana.org/rdap/dns.json', {
    headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`IANA RDAP bootstrap failed (${response.status})`)
  const value = await response.json() as Bootstrap
  if (fetchImpl === fetch) cachedBootstrap = { value, expiresAt: Date.now() + 24 * 60 * 60 * 1000 }
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
  if (!domains.length) return []
  const checkedAt = new Date().toISOString()
  let data: Bootstrap
  try { data = await bootstrap(fetchImpl) }
  catch (error) {
    return domains.map(domain => ({ domain, status: 'unknown', checkedAt, registryEndpoint: null, detail: error instanceof Error ? error.message : 'IANA RDAP bootstrap unavailable' }))
  }
  const results: DomainLookup[] = []
  for (let offset = 0; offset < domains.length; offset += 8) {
    const batch = await Promise.all(domains.slice(offset, offset + 8).map(async domain => {
    if (domain.split('.').length > 2) return { domain, status: 'unknown' as const, checkedAt, registryEndpoint: null, detail: 'This appears to be a subdomain, not an independently registrable domain. RDAP absence must not be treated as availability.' }
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
    results.push(...batch)
  }
  return results
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

export async function brainstormVerifiedDomains(args: { input: string; context?: string; fetchImpl?: FetchLike; generateImpl?: (input:string,count:number)=>Promise<{candidates:DomainSuggestion[];modelInvoked:boolean}> }) {
  if (!isDomainBrainstormRequest(args.input, args.context)) return null
  const count = requestedSuggestionCount(args.input)
  if (!args.generateImpl) return null
  const generated = await args.generateImpl(args.input, count)
  const lookups = await lookupDomainsRdap(generated.candidates.map(candidate => candidate.domain), args.fetchImpl)
  const lookupByDomain = new Map(lookups.map(lookup => [lookup.domain, lookup]))
  const verified = generated.candidates
    .map(candidate => ({ ...candidate, lookup: lookupByDomain.get(candidate.domain)! }))
    .filter(candidate => candidate.lookup?.status === 'no_registration_found')
    .slice(0, count)
  const lines = verified.map((candidate, index) => `${index + 1}. **${candidate.name}** — ${candidate.domain} — ${candidate.meaning}`)
  const reply = verified.length
    ? [`I generated candidates for a software-building and SaaS platform, then checked them through authoritative registry RDAP.`, '', ...lines, '', `Verification: all ${verified.length} domains above returned no registration record at ${lookups[0]?.checkedAt || new Date().toISOString()}. Registrar checkout must still confirm reserved or premium status.`].join('\n')
    : 'COS generated candidates and checked them through authoritative registry RDAP, but none returned a reliable no-registration result. I will not substitute registered or unverified names.'
  return { reply, results: verified.map(item => item.lookup), suggestions: verified.map(({lookup,...candidate}) => candidate), modelInvoked: generated.modelInvoked, requested: count }
}
