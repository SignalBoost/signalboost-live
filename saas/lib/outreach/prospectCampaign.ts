// saas/lib/outreach/prospectCampaign.ts
//
// BACKGROUND PROSPECT CAMPAIGNS — discovery and per-company drafting, done outside
// the chat turn.
//
// Why this exists: the Chief of Staff answers inside one bounded HTTP request
// (BUDGET_MS 240_000 in app/api/support/route.ts, wrapped by a 260s ceiling in
// app/api/concierge/route.ts). Asking it to find ten companies and draft to each is
// twenty-plus sequential model round trips. It cannot fit, so the owner got the
// bounded-limit message instead of a campaign. Here the chat turn only writes a job
// row; a CRON_SECRET-gated worker advances it a few prospects at a time.
//
// What this does NOT do: send. Every draft lands in outreach_queue with status
// 'pending' and still needs the owner's approval and an explicit send in the outreach
// console. createOutreachDraft is reused unchanged, so the existing guardrails hold —
// the message safety gate, the real-published-email requirement (no address is ever
// invented; a company with no findable email is skipped, not guessed at), region
// localization, and the compliance footer.

import { createClient } from '@supabase/supabase-js'
import { callModel } from '@/lib/ai/modelRouter'
import { getExternalInfo } from '@/lib/ai/tools/getExternalInfo'
import { createOutreachDraft } from '@/lib/ai/growthPlans'
import { productKeyOf } from '@/lib/outreach/recipientHistory'
import { discoverGithubOrgs } from '@/lib/outreach/sources/github'

const TABLE = 'prospect_campaign_jobs'
// A SANITY BOUND, NOT A PRODUCT LIMIT. This was 25 and it silently rewrote every larger
// request — a campaign for 30 became a campaign for 25 and the operator was never told.
// The number now stands unless it is absurd, and when it IS reduced the job says so in
// its own record rather than quietly working towards a different target.
const MAX_REQUESTED = 500
// THE OLD CEILING WAS 12, FLAT — so a 25-draft campaign could never reach 25 no matter
// how the market looked. It examined twelve companies, found five usable addresses, and
// reported "completed". The number a buyer asks for has to be reachable, and since some
// share of any list has no published address, the candidate pool must be a MULTIPLE of the
// target rather than a fraction of it.
const MIN_CANDIDATES = 24
// Per ROUND, not per campaign. A round is one tick's worth of discovery, and the campaign
// runs as many rounds as it needs, so this bounds a single search burst rather than the
// campaign's ambition.
const MAX_CANDIDATES_PER_ROUND = 60
function candidateTargetFor(requested: number): number {
  return Math.min(MAX_CANDIDATES_PER_ROUND, Math.max(MIN_CANDIDATES, requested * 3))
}
const MAX_UNITS_PER_TICK = 3
// The most companies a single campaign will examine across all its rounds. Without a
// ceiling, "go round again" is an unbounded loop against a paid search backend — but a flat
// ceiling is the same mistake as a flat request cap, so it scales with what was asked for.
// Six examined per draft wanted, because roughly half of any list has no published address.
function examinedCeilingFor(requested: number): number {
  return Math.max(120, requested * 6)
}
// Sits inside the route's 300s ceiling with room to spare for the final write.
const TICK_BUDGET_MS = 240_000
// A single company = one model call + an email hunt across up to nine pages at 8s
// each. Left unbounded that is ~70s for ONE company, which is why the loop's
// "is there time to start?" check was not enough on its own: it could pass with 20s
// left and then run for a minute. Each unit is now individually capped.
const PER_COMPANY_TIMEOUT_MS = 70_000

function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise<T>(resolve => {
    const timer = setTimeout(() => resolve(onTimeout()), ms)
    work.then(value => { clearTimeout(timer); resolve(value) })
        .catch(() => { clearTimeout(timer); resolve(onTimeout()) })
  })
}

// Never prospect ourselves, and never burn a slot on a directory or aggregator page:
// those pass a naive "looks like a company site" check and waste a whole tick.
const EXCLUDED_HOST_FRAGMENTS = [
  'signalboostapp.com', 'wikipedia.org', 'linkedin.com', 'facebook.com', 'twitter.com',
  'x.com', 'instagram.com', 'youtube.com', 'reddit.com', 'medium.com', 'github.com',
  'crunchbase.com', 'g2.com', 'capterra.com', 'clutch.co', 'glassdoor.com', 'indeed.com',
  'gartner.com', 'forbes.com', 'techcrunch.com', 'quora.com', 'yelp.com',
  // ADDED AFTER A REAL CAMPAIGN DRAFTED TO THREE OF THEM. A US infrastructure campaign
  // returned cloudtango.net ("Top Managed Service Providers in the US"), gocorptech.com
  // ("Largest IT Managed Services Providers in USA") and designrush.com — pages ABOUT
  // companies, ranked and reviewed. The generic filter missed them because their titles
  // carry no digit next to "top". These are the directories that keep coming back.
  'designrush.com', 'goodfirms.co', 'themanifest.com', 'sortlist.com', 'upcity.com',
  'expertise.com', 'trustradius.com', 'softwaresuggest.com', 'techreviewer.co',
  'superbcompanies.com', 'cloudtango.net', 'gocorptech.com', 'itfirms.co', 'selectedfirms.co',
  'topdevelopers.co', 'businessofapps.com', 'producthunt.com', 'g2crowd.com', 'owler.com',
  'zoominfo.com', 'apollo.io', 'similarweb.com', 'statista.com', 'wellfound.com',
  // Vendor partner directories: real pages, but a partner LIST is not a company.
  'partners.amazonaws.com', 'aws.amazon.com', 'partner.microsoft.com', 'cloud.google.com',
]

export type ProspectCampaignStatus =
  | 'queued' | 'discovering' | 'running' | 'completed' | 'failed' | 'cancelled'

export type ProspectCandidate = { name: string; url: string; snippet: string }

export type ProspectResult = {
  name: string
  url: string
  outcome: 'drafted' | 'skipped' | 'error'
  detail: string
  at: string
}

export type ProspectCampaignJob = {
  id: string
  created_by: string | null
  status: ProspectCampaignStatus
  offer: string
  target_criteria: string
  region: string | null
  language: string
  requested_count: number
  candidates: ProspectCandidate[]
  results: ProspectResult[]
  processed: number
  drafts_created: number
  skipped: number
  last_error: string | null
  created_at: string
  updated_at: string
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./i, '').toLowerCase() } catch { return '' }
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createProspectCampaignJob(input: {
  offer: string
  targetCriteria: string
  region?: string | null
  language?: string
  requestedCount?: number
  createdBy?: string | null
}): Promise<{ ok: boolean; job?: ProspectCampaignJob; error?: string }> {
  const db = admin()
  if (!db) return { ok: false, error: 'Supabase service role is not configured.' }

  const offer = clean(input.offer, 2_000)
  const targetCriteria = clean(input.targetCriteria, 2_000)
  if (!offer || !targetCriteria) {
    return { ok: false, error: 'offer and targetCriteria are both required.' }
  }

  const asked = Math.max(1, Number(input.requestedCount) || 5)
  const requested = Math.min(asked, MAX_REQUESTED)
  // Visible, not silent. If this ever fires the operator reads it on the campaign page
  // instead of wondering why the target moved.
  const capNote = requested < asked
    ? `Asked for ${asked}; this worker runs at most ${MAX_REQUESTED} per campaign, so it is running ${requested}. Start a second campaign for the rest.`
    : null
  const language = ['en', 'es', 'pt', 'pl', 'ru'].includes(String(input.language))
    ? String(input.language)
    : 'en'

  const { data, error } = await db
    .from(TABLE)
    .insert({
      created_by: input.createdBy || null,
      status: 'queued',
      last_error: capNote,
      offer,
      target_criteria: targetCriteria,
      region: input.region ? clean(input.region, 200) : null,
      language,
      requested_count: requested,
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, job: data as ProspectCampaignJob }
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getProspectCampaignJob(
  id: string,
): Promise<{ ok: boolean; job?: ProspectCampaignJob; error?: string }> {
  const db = admin()
  if (!db) return { ok: false, error: 'Supabase service role is not configured.' }
  const { data, error } = await db.from(TABLE).select('*').eq('id', id).single()
  if (error || !data) return { ok: false, error: error?.message || 'Campaign job not found.' }
  return { ok: true, job: data as ProspectCampaignJob }
}

export async function listProspectCampaignJobs(
  limit = 10,
): Promise<{ ok: boolean; jobs: ProspectCampaignJob[]; error?: string }> {
  const db = admin()
  if (!db) return { ok: false, jobs: [], error: 'Supabase service role is not configured.' }
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 50)))
  if (error) return { ok: false, jobs: [], error: error.message }
  return { ok: true, jobs: (data || []) as ProspectCampaignJob[] }
}

export async function cancelProspectCampaignJob(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = admin()
  if (!db) return { ok: false, error: 'Supabase service role is not configured.' }
  const { error } = await db
    .from(TABLE)
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['queued', 'discovering', 'running'])
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── Discovery ────────────────────────────────────────────────────────────────

// ── Discovery targeting ──────────────────────────────────────────────────────
//
// The first Brazil campaign drafted flawless Portuguese and then sent it to US
// directory sites. Two reasons, both here:
//   1. The query was the ENTIRE target_criteria (250+ chars of English) with the raw
//      region glued on — "…small infra teams the Brazil company website". Search
//      engines effectively ignore a tail that long, so the country never weighed on
//      the result set and the English phrasing pulled English-language pages.
//   2. Nothing checked afterwards whether a result was even in the requested country,
//      and aggregator/listicle pages ("Top 30 Managed IT Providers", "MSP Database")
//      look exactly like company sites to a naive filter.
//
// So: short queries written in the target's own language, and a region check on the
// way back out.

type CountryProfile = { names: string[]; tld: string; searchName: string; terms: string[] }

const COUNTRY_PROFILES: Record<string, CountryProfile> = {
  br: { names: ['brazil', 'brasil'], tld: '.br', searchName: 'Brasil', terms: ['serviços gerenciados de nuvem', 'consultoria DevOps SRE', 'provedor de serviços gerenciados AWS Azure'] },
  pt: { names: ['portugal'], tld: '.pt', searchName: 'Portugal', terms: ['serviços geridos de cloud', 'consultoria DevOps SRE', 'prestador de serviços geridos AWS Azure'] },
  mx: { names: ['mexico', 'méxico'], tld: '.mx', searchName: 'México', terms: ['servicios administrados de nube', 'consultoría DevOps SRE', 'proveedor de servicios administrados AWS Azure'] },
  ar: { names: ['argentina'], tld: '.ar', searchName: 'Argentina', terms: ['servicios administrados de nube', 'consultoría DevOps SRE', 'proveedor de servicios administrados AWS Azure'] },
  co: { names: ['colombia'], tld: '.co', searchName: 'Colombia', terms: ['servicios administrados de nube', 'consultoría DevOps SRE', 'proveedor de servicios administrados AWS Azure'] },
  cl: { names: ['chile'], tld: '.cl', searchName: 'Chile', terms: ['servicios administrados de nube', 'consultoría DevOps SRE', 'proveedor de servicios administrados AWS Azure'] },
  es: { names: ['spain', 'españa'], tld: '.es', searchName: 'España', terms: ['servicios gestionados de nube', 'consultoría DevOps SRE', 'proveedor de servicios gestionados AWS Azure'] },
  pl: { names: ['poland', 'polska'], tld: '.pl', searchName: 'Polska', terms: ['zarządzane usługi chmurowe', 'konsulting DevOps SRE', 'dostawca usług zarządzanych AWS Azure'] },
  ru: { names: ['russia', 'россия'], tld: '.ru', searchName: 'Россия', terms: ['управляемые облачные услуги', 'DevOps SRE консалтинг', 'поставщик управляемых услуг AWS Azure'] },
  uk: { names: ['united kingdom', 'britain', 'england'], tld: '.uk', searchName: 'United Kingdom', terms: ['managed cloud services provider', 'DevOps SRE consultancy', 'managed service provider AWS Azure'] },
  us: { names: ['united states', 'usa', 'america'], tld: '.us', searchName: 'United States', terms: ['managed cloud services provider', 'DevOps SRE consultancy', 'managed service provider AWS Azure'] },
}

// "Start in the Brazil." parses to region "the Brazil" — harmless in prose, useless
// in a search query. Strip the article before anything reads it.
function normalizeRegion(region: string | null): string {
  return String(region || '').replace(/^\s*(the|el|la|o|a)\s+/i, '').replace(/[.,;]+$/, '').trim()
}

function profileFor(region: string | null): CountryProfile | null {
  const normalized = normalizeRegion(region).toLowerCase()
  if (!normalized) return null
  for (const profile of Object.values(COUNTRY_PROFILES)) {
    if (profile.names.some(name => normalized === name || normalized.includes(name))) return profile
  }
  return null
}

// A handful of short, high-signal queries beat one long one. Each stays well under the
// length where a search backend starts discarding terms.
//
// SECTOR ROTATION. Three queries against one sector return one sector's worth of results,
// and after de-duplication that is a dozen companies at most — which is exactly what a real
// campaign produced. These widen the net without lengthening any single query, and a second
// discovery round asks a DIFFERENT set rather than re-asking the first and re-finding the
// same twelve.
const SECTOR_QUERIES: Record<string, string[]> = {
  en: [
    'cloud infrastructure company', 'SaaS platform company engineering team',
    'fintech engineering company', 'healthcare technology company platform',
    'logistics technology company', 'e-commerce platform company',
    'data analytics company engineering', 'cybersecurity company platform',
    'telecom software company', 'manufacturing software company',
  ],
  es: [
    'empresa de infraestructura cloud', 'empresa SaaS plataforma',
    'empresa fintech tecnología', 'empresa de logística tecnología',
    'empresa de comercio electrónico plataforma', 'empresa de ciberseguridad',
  ],
  pt: [
    'empresa de infraestrutura em nuvem', 'empresa SaaS plataforma',
    'empresa fintech tecnologia', 'empresa de logística tecnologia',
    'empresa de comércio eletrônico plataforma', 'empresa de cibersegurança',
  ],
  pl: [
    'firma infrastruktura chmurowa', 'firma SaaS platforma',
    'firma fintech technologia', 'firma logistyczna technologia',
    'firma e-commerce platforma', 'firma cyberbezpieczeństwo',
  ],
  ru: [
    'компания облачная инфраструктура', 'SaaS компания платформа',
    'финтех компания технологии', 'логистическая технологическая компания',
    'компания электронной коммерции платформа', 'компания кибербезопасность',
  ],
}

function sectorQueriesFor(job: ProspectCampaignJob, place: string): string[] {
  const language = String(job.language || 'en').toLowerCase().slice(0, 2)
  const bank = SECTOR_QUERIES[language] || SECTOR_QUERIES.en
  return bank.map(term => clean(place ? `${term} ${place}` : term, 120))
}

function searchQueriesFor(job: ProspectCampaignJob): string[] {
  const region = normalizeRegion(job.region)
  const profile = profileFor(job.region)
  const place = profile?.searchName || region

  // A campaign that has already examined companies is on a later round, so it starts
  // further into the sector list. Without this, round two re-runs round one's queries and
  // finds round one's companies, all of which are already in the seen-set — a wasted tick.
  const round = Math.floor(Number(job.processed || 0) / 6)
  const sectors = sectorQueriesFor(job, place)
  const rotated = sectors.slice((round * 4) % sectors.length).concat(sectors.slice(0, (round * 4) % sectors.length))

  if (profile) {
    return [...profile.terms.slice(0, 3).map(term => clean(`${term} ${place}`, 120)), ...rotated].slice(0, 9)
  }

  // No profile for this region: fall back to the first couple of criteria phrases,
  // still short, still with the place name attached.
  const phrases = job.target_criteria
    .split(/[,;\u2014\u2013]/)
    .map(part => clean(part, 60))
    .filter(part => part.length > 8)
    .slice(0, 3)
  const base = phrases.length ? phrases : [clean(job.target_criteria, 60)]
  return [...base.map(phrase => clean(place ? `${phrase} ${place}` : phrase, 120)), ...rotated].slice(0, 9)
}

// Directory, ranking and listicle pages. These are the pages that got drafted to on
// the first Brazil run — they are lists OF providers, not providers.
const AGGREGATOR_HOST_HINTS = [
  'directory', 'directories', 'companies', 'firms', 'providers', 'database', 'ranking',
  'rankings', 'toplist', 'top-', 'best-', 'listing', 'listings', 'compare', 'reviews',
]
// THE OLD PATTERN REQUIRED A DIGIT BESIDE "top", and that is why three listicles were
// drafted to in a real campaign. "Top Managed Service Providers in the United States 2026"
// and "10 Top DevOps Consulting Companies in USA [2026 Edition]" both sailed through: the
// first has no digit next to "top", the second puts the digit on the wrong side.
//
// The reliable signal is not the number. It is a SUPERLATIVE next to a PLURAL BUSINESS
// NOUN — "top providers", "best companies", "leading firms". A company writes "Managed
// Cloud Services"; an article writes "Top Managed Cloud Services Companies".
const AGGREGATOR_TITLE_HINTS = /\b(top\s*\d+|best\s+\d+|\d+\s+best|\d+\s+top|comparison|independent comparison|database|directory|ranking|list of|guide to|roundup)\b/i
const SUPERLATIVE_LIST = /\b(top|best|leading|largest|greatest|fastest[- ]growing|most popular)\b[^.]{0,60}\b(companies|company|providers|provider|firms|agencies|agency|consultancies|consultants|vendors|partners|platforms|tools|solutions|services|developers|shops)\b/i
// "…in USA 2026", "[2026 Edition]", "2026 Guide" — a year in a title is an article's
// signature, not a company's.
const DATED_ARTICLE = /\b(20\d{2})\b[^.]{0,20}\b(guide|edition|list|ranking|review|report)\b|\b(guide|edition|list|ranking|review|report)\b[^.]{0,20}\b(20\d{2})\b/i

function looksLikeAggregator(host: string, title: string): boolean {
  if (AGGREGATOR_HOST_HINTS.some(hint => host.includes(hint))) return true
  if (AGGREGATOR_TITLE_HINTS.test(title)) return true
  if (SUPERLATIVE_LIST.test(title)) return true
  return DATED_ARTICLE.test(title)
}

function candidateFrom(result: { title: string; url: string; snippet: string }): ProspectCandidate | null {
  const host = hostOf(result.url)
  if (!host) return null
  if (EXCLUDED_HOST_FRAGMENTS.some(fragment => host === fragment || host.endsWith(`.${fragment}`))) return null
  if (looksLikeAggregator(host, String(result.title || ''))) return null
  // Prefer the company's root site over a deep blog/article URL: the email finder and
  // the analyzer both work far better against a homepage.
  const url = `https://${host}`
  const name = clean(result.title.split(/[|\u2013\u2014-]/)[0], 160) || host
  return { name, url, snippet: clean(result.snippet, 400) }
}

// Three-way, not boolean. A .com company with no country signal is UNKNOWN, not
// foreign — treating unknown as a miss would starve any campaign aimed at a country
// whose businesses mostly use .com. Only a different country's ccTLD is a positive
// miss. Confirmed matches are used first, unknowns next, confirmed-elsewhere last.
type RegionSignal = 'match' | 'unknown' | 'other'

function regionSignal(candidate: ProspectCandidate, job: ProspectCampaignJob): RegionSignal {
  const region = normalizeRegion(job.region)
  if (!region) return 'match'
  const host = hostOf(candidate.url)
  const profile = profileFor(job.region)
  const hay = `${candidate.name} ${candidate.snippet}`.toLowerCase()

  if (profile && (host.endsWith(profile.tld) || host.includes(`${profile.tld}.`))) return 'match'
  const names = profile ? profile.names : [region.toLowerCase()]
  if (names.some(name => hay.includes(name))) return 'match'

  for (const other of Object.values(COUNTRY_PROFILES)) {
    if (profile && other.tld === profile.tld) continue
    if (host.endsWith(other.tld)) return 'other'
  }
  return 'unknown'
}

// Companies already in the outreach queue are excluded BEFORE they take a candidate
// slot. Without this, discovery re-finds the same firms every campaign in a market,
// each one burns a slot, and createOutreachDraft rejects it as a duplicate at the very
// end — so a 10-draft campaign quietly returns 2. Filtering at selection time means the
// slots go to companies that have never been contacted.
async function knownHosts(db: ReturnType<typeof admin>, wantedProduct: string | null): Promise<Set<string>> {
  const known = new Set<string>()
  if (!db) return known
  const { data } = await db
    .from('outreach_queue')
    .select('business_url,product_key')
    .limit(2_000)
  for (const row of data || []) {
    // Only exclude companies already approached about THIS product. A company contacted
    // about something else is still a valid prospect for this campaign.
    if (productKeyOf(String((row as any)?.product_key || '')) !== wantedProduct) continue
    const host = hostOf(String(row?.business_url || ''))
    if (host) known.add(host)
  }
  return known
}

async function runDiscovery(
  job: ProspectCampaignJob,
  // Wall-clock budget for discovery as a whole. Discovery previously had NO time
  // bound while the drafting loop did — so a tick could spend its entire 60-second
  // function ceiling here, get killed by the platform, and save nothing. Every
  // queued campaign then stayed queued forever, which is exactly what happened in
  // production for a full day of ticks.
  budgetMs: number,
): Promise<{ ok: boolean; candidates: ProspectCandidate[]; error?: string; note?: string }> {
  const startedAt = Date.now()
  const timeLeft = () => budgetMs - (Date.now() - startedAt)
  // Seed the seen-set with every company already in the queue, so previously contacted
  // firms are skipped exactly like within-run duplicates.
  const seen = await knownHosts(admin(), productKeyOf(job.offer))
  const target = candidateTargetFor(job.requested_count)
  const matched: ProspectCandidate[] = []
  const unknown: ProspectCandidate[] = []
  const elsewhere: ProspectCandidate[] = []
  let lastError = ''

  // Candidates already examined in an earlier round are in the seen-set too, so a second
  // discovery pass cannot hand back the same companies it already worked through.
  for (const previous of Array.isArray(job.results) ? job.results : []) {
    const host = hostOf(String((previous as ProspectResult)?.url || ''))
    if (host) seen.add(host)
  }

  for (const query of searchQueriesFor(job)) {
    if (matched.length >= target || timeLeft() < 8_000) break
    const search = await getExternalInfo(query, Math.min(20, target))
    if (!search.ok) { lastError = search.error || 'Search returned no results.'; continue }

    for (const result of search.results) {
      const candidate = candidateFrom(result)
      if (!candidate) continue
      const host = hostOf(candidate.url)
      if (seen.has(host)) continue
      seen.add(host)
      const signal = regionSignal(candidate, job)
      if (signal === 'match') matched.push(candidate)
      else if (signal === 'unknown') unknown.push(candidate)
      else elsewhere.push(candidate)
    }
  }

  // SECOND SOURCE: GitHub organizations. Web search finds companies that market
  // themselves well; GitHub finds companies that demonstrably operate infrastructure,
  // which is a different and often better-qualified set for this product. It also
  // covers countries where the local web results are thin. Failures here are ignored —
  // it supplements the search, it does not gate it.
  if (matched.length < target && timeLeft() > 10_000) {
    const profile = profileFor(job.region)
    const locations = profile ? Array.from(new Set([profile.searchName, ...profile.names])) : [normalizeRegion(job.region)]
    const github = await discoverGithubOrgs({ locations, limit: target, budgetMs: timeLeft() - 3_000 })
    if (github.ok) {
      for (const candidate of github.candidates) {
        const host = hostOf(candidate.url)
        if (!host || seen.has(host)) continue
        seen.add(host)
        const signal = regionSignal(candidate, job)
        // GitHub already filtered by the org's own stated location, so an entry with no
        // other country signal is treated as in-region rather than unknown.
        if (signal === 'other') elsewhere.push(candidate)
        else matched.push(candidate)
      }
    } else if (!matched.length && github.error) {
      lastError = lastError || github.error
    }
  }

  const ordered = [...matched, ...unknown, ...elsewhere].slice(0, target)
  if (!ordered.length) return { ok: false, candidates: [], error: lastError || 'No usable company sites in the search results.' }

  // Record it when the country search produced nothing confirmed, so a campaign never
  // quietly becomes a different campaign than the one that was asked for.
  const note = matched.length
    ? undefined
    : `No result confirmed in region "${normalizeRegion(job.region)}"; proceeding with unconfirmed results.`
  return { ok: true, candidates: ordered, note }
}

// ── Drafting ─────────────────────────────────────────────────────────────────

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', pt: 'Portuguese', pl: 'Polish', ru: 'Russian',
}

async function draftMessageFor(
  job: ProspectCampaignJob,
  candidate: ProspectCandidate,
): Promise<string> {
  const languageName = LANGUAGE_NAMES[job.language] || 'English'
  const systemPrompt = [
    'You write short, specific, honest B2B outreach emails that a founder would be comfortable sending under their own name.',
    'Open with the problem this specific company plausibly has, based only on what the brief says about them — never invent facts, customers, metrics, funding, headcount, or a prior conversation.',
    'Name ONLY the recipient company. Never mention any other company by name: if the notes below happen to list other firms, they are neighbours in a search result, not context about the recipient, and naming them makes the email obviously mass-produced.',
    'Then introduce the offer as the answer. No hype, no guarantees of revenue, rankings, or results.',
    'One clear call to action at the end.',
    'HARD LIMIT: between 400 and 1,400 characters total. Plain text only, no markdown, no subject line, no signature block.',
    `Write in ${languageName}.`,
    'Return only the message body.',
  ].join(' ')

  const prompt = [
    `Recipient company: ${candidate.name}`,
    `Their website: ${candidate.url}`,
    candidate.snippet ? `What is publicly said about them: ${candidate.snippet}` : '',
    '',
    `Who we are targeting and why: ${job.target_criteria}`,
    '',
    `What we are offering: ${job.offer}`,
    '',
    'Write the outreach message now.',
  ].filter(Boolean).join('\n')

  const raw = await callModel({ modelPreference: 'claude', systemPrompt, prompt, maxTokens: 700 })
  return clean(String(raw || '').replace(/```/g, ''), 2_300)
}

// ── Advance (one worker tick) ────────────────────────────────────────────────

export async function advanceProspectCampaigns(): Promise<{
  ok: boolean
  jobId?: string
  status?: ProspectCampaignStatus
  units: number
  error?: string
}> {
  const db = admin()
  if (!db) return { ok: false, units: 0, error: 'Supabase service role is not configured.' }

  const startedAt = Date.now()
  const remainingMs = () => TICK_BUDGET_MS - (Date.now() - startedAt)

  // Oldest unfinished job first, so a queued campaign cannot starve behind a newer one.
  const { data: claimed, error: claimError } = await db
    .from(TABLE)
    .select('*')
    .in('status', ['queued', 'discovering', 'running'])
    .order('created_at', { ascending: true })
    .limit(1)

  if (claimError) return { ok: false, units: 0, error: claimError.message }
  if (!claimed || !claimed.length) return { ok: true, units: 0 }

  let job = claimed[0] as ProspectCampaignJob
  let units = 0

  // Phase 1 — discovery. One search, then the job has a candidate list to chew through.
  if (job.status === 'queued' || !Array.isArray(job.candidates) || !job.candidates.length) {
    // Leave at least 10s of the tick for saving results and, when possible, a first
    // draft. Discovery that fills the whole tick starves the write that persists it.
    const discovery = await runDiscovery(job, Math.max(10_000, remainingMs() - 10_000))
    if (!discovery.ok) {
      await db.from(TABLE).update({
        status: 'failed',
        last_error: discovery.error || 'Discovery failed.',
        updated_at: new Date().toISOString(),
      }).eq('id', job.id)
      return { ok: false, jobId: job.id, status: 'failed', units: 0, error: discovery.error }
    }

    const { data: updated, error: updateError } = await db.from(TABLE).update({
      status: 'running',
      candidates: discovery.candidates,
      last_error: discovery.note || null,
      updated_at: new Date().toISOString(),
    }).eq('id', job.id).select('*').single()

    if (updateError) return { ok: false, jobId: job.id, units: 0, error: updateError.message }
    job = updated as ProspectCampaignJob
    units += 1
  }

  // Phase 2 — draft one company per unit, a few units per tick, always inside the budget.
  const candidates = Array.isArray(job.candidates) ? job.candidates : []
  const results: ProspectResult[] = Array.isArray(job.results) ? [...job.results] : []
  let processed = job.processed
  let drafted = job.drafts_created
  let skipped = job.skipped
  let lastError: string | null = job.last_error

  while (
    processed < candidates.length &&
    drafted < job.requested_count &&
    units < MAX_UNITS_PER_TICK &&
    remainingMs() > PER_COMPANY_TIMEOUT_MS + 15_000
  ) {
    const candidate = candidates[processed]
    processed += 1
    units += 1

    try {
      const message = await withTimeout(draftMessageFor(job, candidate), 45_000, () => '')
      if (!message || message.length < 40) {
        skipped += 1
        results.push({ name: candidate.name, url: candidate.url, outcome: 'skipped', detail: 'Draft came back empty or too short.', at: new Date().toISOString() })
        continue
      }

      // Reused unchanged: finds a REAL published email or skips, localizes to the
      // target's region, appends the compliance footer, inserts as 'pending'.
      const created = await withTimeout(
        // The campaign's offer is the product key, so duplicate protection is scoped to
        // THIS product: the same company can be approached again in a later campaign
        // selling something else, but never twice for this one.
        createOutreachDraft({ businessName: candidate.name, businessUrl: candidate.url, message, senderKey: 'saasSales', productKey: job.offer }),
        PER_COMPANY_TIMEOUT_MS - 45_000,
        () => ({ ok: false, skipped: true, error: 'Timed out while looking for a published email.' } as any),
      )

      if (created.ok) {
        drafted += 1
        results.push({ name: candidate.name, url: candidate.url, outcome: 'drafted', detail: created.contactEmail || '', at: new Date().toISOString() })
      } else if (created.skipped) {
        skipped += 1
        results.push({ name: candidate.name, url: candidate.url, outcome: 'skipped', detail: 'No published contact email found.', at: new Date().toISOString() })
      } else {
        skipped += 1
        lastError = created.error || 'Draft rejected.'
        results.push({ name: candidate.name, url: candidate.url, outcome: 'error', detail: lastError, at: new Date().toISOString() })
      }
    } catch (err: any) {
      skipped += 1
      lastError = String(err?.message || err || 'Unknown error while drafting.')
      results.push({ name: candidate.name, url: candidate.url, outcome: 'error', detail: lastError, at: new Date().toISOString() })
    }
  }

  // A CAMPAIGN THAT RUNS OUT OF CANDIDATES IS NOT FINISHED — IT IS OUT OF CANDIDATES.
  //
  // This previously reported 'completed' the moment the candidate list was exhausted, even
  // at 5 drafts of 25. The number the operator asked for was silently abandoned and the
  // screen said the work was done. Now an exhausted list with the target unmet CLEARS the
  // candidates, which sends the next tick back through discovery on a different set of
  // sector queries.
  const targetMet = drafted >= job.requested_count
  const candidatesExhausted = processed >= candidates.length
  // A round that examined companies and produced nothing at all has hit something
  // systematic — an empty search backend, a blocked crawler — and going round again would
  // burn ticks repeating it. Stop and say so instead.
  const roundProducedNothing = candidatesExhausted && drafted === job.drafts_created && processed > job.processed
  const goAgain = candidatesExhausted && !targetMet && !roundProducedNothing && processed < examinedCeilingFor(job.requested_count)
  const finished = targetMet || (candidatesExhausted && !goAgain)
  const status: ProspectCampaignStatus = finished ? 'completed' : 'running'

  const shortfallNote = finished && !targetMet
    ? `Stopped at ${drafted} of ${job.requested_count}. ${processed} companies examined, ${skipped} skipped — most without a published contact address. Widen the region or lower the count.`
    : lastError

  const { error: saveError } = await db.from(TABLE).update({
    status,
    results: results.slice(-60),
    processed,
    // Clearing the candidate list is what sends the next tick back to discovery.
    candidates: goAgain ? [] : candidates,
    drafts_created: drafted,
    skipped,
    last_error: shortfallNote,
    updated_at: new Date().toISOString(),
  }).eq('id', job.id)

  if (saveError) return { ok: false, jobId: job.id, units, error: saveError.message }
  return { ok: true, jobId: job.id, status, units }
}

export function summarizeProspectCampaign(job: ProspectCampaignJob): string {
  const target = job.requested_count
  const parts = [
    `Status: ${job.status}.`,
    `${job.drafts_created} of ${target} drafts queued`,
    job.skipped ? `${job.skipped} skipped` : '',
    `${job.processed} companies examined of ${Array.isArray(job.candidates) ? job.candidates.length : 0} found`,
    job.last_error ? `Last error: ${job.last_error}` : '',
  ].filter(Boolean)
  return parts.join('. ').replace(/\.\./g, '.')
}
