// saas/lib/ai/cos/domainAvailability.ts
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
const INTENT = /\b(?:domain|url|tld|registrar|rdap|whois|availability|available|registered|taken|purchase|buy|verify|verification|exist|exists|existing)\b/i
const BRAINSTORM = /\b(?:brainstorm|suggest|suggestion|ideas?|names?|naming|brand|creative)\b/i
const PLATFORM = /\b(?:platform|software|developer|development|coding|code|saas|app|product|domain|url)\b/i
const LABEL = /^[a-z0-9][a-z0-9-]{1,62}$/
let cachedBootstrap: { value: Bootstrap; expiresAt: number } | null = null

export type DomainSuggestion = { name: string; domain: string; meaning: string }

// Marketing preference only — which TLDs we are willing to put in front of the
// owner. Whether any of them can actually be VERIFIED is not decided here; it
// is resolved live from the IANA bootstrap by resolveVerifiableTlds below, so a
// TLD the registry does not serve drops out on its own and one that starts
// being served comes back on its own. No enumerated exclusion list.
export const BRANDABLE_TLDS: readonly string[] = ['com', 'ai', 'dev', 'app', 'io']

export function isDomainBrainstormRequest(input: string, context = ''): boolean {
  const combined = `${input}\n${context}`
  return BRAINSTORM.test(input) && PLATFORM.test(combined)
}

function requestedSuggestionCount(input: string): number {
  const explicit = input.match(/\b(\d{1,2})\s+(?:domain\s+)?(?:suggestions?|ideas?|names?)/i)?.[1]
  return Math.max(1, Math.min(20, Number(explicit || 15)))
}

export function parseGeneratedDomainSuggestions(
  raw: string,
  excludeLegacyWords: boolean,
  allowedTlds: readonly string[] = BRANDABLE_TLDS,
): DomainSuggestion[] {
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}')
  const object = start >= 0 && end > start ? raw.slice(start, end + 1) : null
  if (!object) return []
  const allowed = allowedTlds.length ? allowedTlds : BRANDABLE_TLDS
  try {
    const parsed = JSON.parse(object) as { candidates?: unknown }
    const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : []
    const out: DomainSuggestion[] = []
    for (const item of candidates) {
      const value = item as Record<string, unknown>
      const name = String(value?.name || '').replace(/[^a-z0-9 -]/gi, '').trim().slice(0, 40)
      const domain = typeof value?.domain === 'string' ? value.domain.replace(/\\\./g, '.').trim().toLowerCase() : ''
      const meaning = typeof value?.meaning === 'string' ? value.meaning.replace(/\s+/g, ' ').trim().slice(0, 180) : ''
      const dot = domain.lastIndexOf('.')
      const label = dot > 0 ? domain.slice(0, dot) : ''
      const tld = dot > 0 ? domain.slice(dot + 1) : ''
      if (!name || !meaning) continue
      if (!label || !LABEL.test(label) || !allowed.includes(tld)) continue
      if (excludeLegacyWords && /signal|boost/i.test(`${name} ${domain}`)) continue
      if (!out.some(candidate => candidate.domain === domain || candidate.name.toLowerCase() === name.toLowerCase())) out.push({ name, domain, meaning })
    }
    return out.slice(0, 50)
  } catch { return [] }
}

export function extractDomainCandidates(input: string, context = ''): string[] {
  if (!INTENT.test(input)) return []
  const found: string[] = []
  for (const match of input.matchAll(DOMAIN)) {
    const value = String(match[1] || '').toLowerCase().replace(/\.$/, '')
    if (value && !found.includes(value)) found.push(value)
  }
  const explicitCount = found.length
  const contextual = [...context.matchAll(DOMAIN)].map(match => String(match[1] || '').toLowerCase().replace(/\.$/, ''))
  for (const value of contextual) {
    const label = value.split('.')[0]
    const explicitlyNamed = new RegExp(`(?:^|[^a-z0-9-])${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9-])`, 'i').test(input)
    if ((explicitCount === 0 || explicitlyNamed) && value && !found.includes(value)) found.push(value)
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

// Returns the subset of `preferred` the authoritative IANA bootstrap can
// actually answer for. Generating a name on a TLD outside this set burns a
// candidate slot on something that can never come back verified.
export async function resolveVerifiableTlds(
  preferred: readonly string[] = BRANDABLE_TLDS,
  fetchImpl: FetchLike = fetch,
): Promise<{ tlds: string[]; unsupported: string[]; bootstrapAvailable: boolean }> {
  let data: Bootstrap
  try { data = await bootstrap(fetchImpl) }
  catch { return { tlds: [...preferred], unsupported: [], bootstrapAvailable: false } }
  const tlds: string[] = []
  const unsupported: string[] = []
  for (const tld of preferred) {
    if (endpointFor(`example.${tld}`, data)) tlds.push(tld)
    else unsupported.push(tld)
  }
  return { tlds: tlds.length ? tlds : [...preferred], unsupported, bootstrapAvailable: true }
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

type DomainCandidateGenerator = (
  input: string,
  count: number,
  excludedDomains?: string[],
) => Promise<{ candidates: DomainSuggestion[]; modelInvoked: boolean }>

function candidateLabel(domain: string): string {
  const dot = domain.lastIndexOf('.')
  return dot > 0 ? domain.slice(0, dot) : ''
}

function generationInput(input: string, context = ''): string {
  const prior = context.trim().slice(-6_000)
  return prior ? `${prior}\n\n${input.trim()}` : input.trim()
}

export async function brainstormVerifiedDomains(args: { input: string; context?: string; fetchImpl?: FetchLike; generateImpl?: DomainCandidateGenerator }) {
  if (!isDomainBrainstormRequest(args.input, args.context)) return null
  const count = requestedSuggestionCount(args.input)
  if (!args.generateImpl) return null
  const seenDomains = new Set<string>()
  const verified: Array<DomainSuggestion & { lookup: DomainLookup }> = []
  // Every generated candidate that did NOT come back as a clean 404 used to be
  // dropped without trace, so a run in which the registry rate-limited us was
  // indistinguishable from a run in which the names were genuinely taken.
  const registered: Array<DomainSuggestion & { lookup: DomainLookup }> = []
  const unresolved: Array<DomainSuggestion & { lookup: DomainLookup }> = []
  const allLookups: DomainLookup[] = []
  let modelInvoked = false
  let generatedCount = 0
  const fetchImpl = args.fetchImpl ?? fetch
  const { tlds: verifiableTlds } = await resolveVerifiableTlds(BRANDABLE_TLDS, fetchImpl)
  const ownerGenerationInput = generationInput(args.input, args.context)

  // Availability is part of the search loop, not a one-shot filter. A creative
  // batch that is fully registered must inform the next reasoner batch instead
  // of ending the owner's assignment prematurely. The preceding owner context
  // is carried into every generation wave so constraints such as abandoning the
  // old brand cannot disappear on a terse follow-up.
  for (let wave = 0; wave < 3 && verified.length < count; wave += 1) {
    const generated = await args.generateImpl(ownerGenerationInput, count - verified.length, [...seenDomains])
    modelInvoked ||= generated.modelInvoked
    const fresh = generated.candidates.filter(candidate => {
      if (seenDomains.has(candidate.domain)) return false
      seenDomains.add(candidate.domain)
      return true
    })
    if (!fresh.length) continue
    generatedCount += fresh.length

    const originalLookups = await lookupDomainsRdap(fresh.map(candidate => candidate.domain), fetchImpl)
    allLookups.push(...originalLookups)
    const originalByDomain = new Map(originalLookups.map(lookup => [lookup.domain, lookup]))
    const pending: Array<{ candidate: DomainSuggestion; original: DomainLookup; alternatives: string[] }> = []

    for (const candidate of fresh) {
      const original = originalByDomain.get(candidate.domain)
      if (!original) continue
      if (original.status === 'no_registration_found') {
        if (verified.length < count) verified.push({ ...candidate, lookup: original })
        continue
      }
      if (verified.length >= count) break
      const label = candidateLabel(candidate.domain)
      const originalTld = candidate.domain.split('.').at(-1) || ''
      const alternatives = verifiableTlds
        .filter(tld => tld !== originalTld)
        .map(tld => `${label}.${tld}`)
        .filter(domain => domain !== candidate.domain && !seenDomains.has(domain))
      for (const domain of alternatives) seenDomains.add(domain)
      pending.push({ candidate, original, alternatives })
    }

    // A neural name is not discarded merely because its first TLD is registered.
    // Check deterministic TLD alternatives for the SAME neural name and meaning;
    // code changes only the registry suffix and never invents a replacement name.
    const alternateDomains = pending.flatMap(item => item.alternatives)
    const alternateLookups = alternateDomains.length ? await lookupDomainsRdap(alternateDomains, fetchImpl) : []
    allLookups.push(...alternateLookups)
    const alternateByDomain = new Map(alternateLookups.map(lookup => [lookup.domain, lookup]))

    for (const item of pending) {
      if (verified.length >= count) break
      const alternatives = item.alternatives.map(domain => alternateByDomain.get(domain)).filter((lookup): lookup is DomainLookup => Boolean(lookup))
      const available = alternatives.find(lookup => lookup.status === 'no_registration_found')
      if (available) {
        verified.push({ ...item.candidate, domain: available.domain, lookup: available })
        continue
      }
      const unknown = [item.original, ...alternatives].find(lookup => lookup.status === 'unknown')
      if (unknown) unresolved.push({ ...item.candidate, lookup: unknown })
      else registered.push({ ...item.candidate, lookup: item.original })
    }
  }

  const checkedAt = allLookups.at(-1)?.checkedAt || allLookups[0]?.checkedAt || new Date().toISOString()
  const lines = verified.map((candidate, index) => `${index + 1}. **${candidate.name}** — ${candidate.domain} — ${candidate.meaning}`)
  const shortfall = Math.max(0, count - verified.length)
  const unresolvedLines = shortfall && unresolved.length
    ? [
      '',
      `Not verified — the authoritative registry did not answer for these ${unresolved.length}. Treat them as unknown, not as available:`,
      ...unresolved.slice(0, count).map(candidate => `- **${candidate.name}** — ${candidate.domain} — ${candidate.meaning} (${candidate.lookup.detail})`),
    ]
    : []

  const accounting = [
    `Verification at ${checkedAt}: ${verified.length} of ${generatedCount} generated ${generatedCount === 1 ? 'name' : 'names'} returned no registration record`,
    registered.length ? `${registered.length} came back registered across checked TLDs` : '',
    unresolved.length ? `${unresolved.length} could not be checked conclusively` : '',
  ].filter(Boolean).join(', ') + '.'

  const reply = verified.length
    ? [
      `I generated ${generatedCount} ${generatedCount === 1 ? 'candidate' : 'candidates'} for a software-building and SaaS platform, then checked them through authoritative registry RDAP.`,
      '',
      ...lines,
      ...unresolvedLines,
      '',
      accounting,
      shortfall ? `You asked for ${count}; I can only stand behind ${verified.length}. Registrar checkout must still confirm reserved or premium status.` : 'Registrar checkout must still confirm reserved or premium status.',
    ].join('\n')
    : [
      'COS generated candidates and checked them through authoritative registry RDAP, but none returned a reliable no-registration result. I will not substitute registered or unverified names.',
      ...unresolvedLines,
      generatedCount ? '' : '',
      generatedCount ? accounting : '',
    ].filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n').trim()

  return {
    reply,
    results: verified.map(item => item.lookup),
    suggestions: verified.map(({ lookup, ...candidate }) => candidate),
    unresolved: unresolved.map(({ lookup, ...candidate }) => candidate),
    registeredCount: registered.length,
    generatedCount,
    modelInvoked,
    requested: count,
  }
}
