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
import { manifestsForOffer } from '@/lib/portable-products/matchManifests'

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
// THROUGHPUT. Every one of these is buyer-tunable through the environment, because a
// Fortune-500 buyer's rate limits are not ours: one arrives with an enterprise model
// contract and a paid enrichment plan and wants forty at a time, another is on a starter
// key and wants four. A hardcoded 3 was a guess about someone else's infrastructure.
//
// The work is entirely I/O — a model round trip and a handful of page fetches — so the
// companies in a batch are independent and run TOGETHER. Sequentially, three companies
// used about 90 seconds of a 240-second tick and the rest of the tick was thrown away.
function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name])
  if (!Number.isFinite(raw) || raw <= 0) return fallback
  return Math.max(min, Math.min(max, Math.floor(raw)))
}
// How many companies are worked on at the same instant.
const CONCURRENCY = envInt('OUTREACH_CAMPAIGN_CONCURRENCY', 8, 1, 40)
// How many companies one tick may examine in total, across all its batches.
const MAX_UNITS_PER_TICK = envInt('OUTREACH_CAMPAIGN_UNITS_PER_TICK', 60, 1, 400)
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

// THE NAME HAS TO BE THE COMPANY, NOT THE PAGE'S SUBJECT.
//
// This took the first segment of the page title and trusted it. For goinfinite.net the
// title opened with "DevOps Consulting", so a real draft addressed a firm called
// "DevOps Consulting" and offered to install software "in a non-production environment
// of DevOps Consulting". The recipient reads a service category where their own name
// should be, which is worse than a plain mail-merge failure — it says nobody looked.
//
// A company's name almost always echoes its domain, so the domain arbitrates. Title
// segments are tried in order and the first one that echoes the domain root wins; when
// none does, the domain root itself is used, which is at least always true.
function companyNameFrom(title: string, host: string): string {
  const root = host.split('.')[0] || host
  // Diacritics are stripped before comparing, or "Login Logística" fails to match
  // loginlogistica.com.br and a company with a perfectly good name on its own page
  // gets addressed by its bare domain instead.
  const squash = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const rootKey = squash(root)

  const segments = String(title || '').split(/[|\u2013\u2014\u00b7:]|\s-\s/)
  for (const segment of segments) {
    const candidate = clean(segment, 160)
    if (!candidate) continue
    const key = squash(candidate)
    if (!key) continue
    // Either direction counts: "Infinite Ltd" for goinfinite.net, or a domain that
    // spells the name out in full.
    if (key.includes(rootKey) || rootKey.includes(key)) return candidate
  }

  // Nothing in the title refers to this company, so use its own domain rather than the
  // page's topic. Hyphens and underscores become spaces; capitalisation is left to the
  // first letter only, since forcing title case mangles names like "goCardless".
  const readable = root.replace(/[-_]+/g, ' ').trim()
  return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : host
}

function candidateFrom(result: { title: string; url: string; snippet: string }): ProspectCandidate | null {
  const host = hostOf(result.url)
  if (!host) return null
  if (EXCLUDED_HOST_FRAGMENTS.some(fragment => host === fragment || host.endsWith(`.${fragment}`))) return null
  if (looksLikeAggregator(host, String(result.title || ''))) return null
  // Prefer the company's root site over a deep blog/article URL: the email finder and
  // the analyzer both work far better against a homepage.
  const url = `https://${host}`
  return { name: companyNameFrom(String(result.title || ''), host), url, snippet: clean(result.snippet, 400) }
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
  // And so are candidates still WAITING in the queue: discovery now appends to the
  // queue rather than replacing it, so a fresh round must not re-find a company that
  // is already lined up.
  for (const waiting of Array.isArray(job.candidates) ? job.candidates : []) {
    const host = hostOf(String((waiting as ProspectCandidate)?.url || ''))
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

// ── What the product actually does ───────────────────────────────────────────
//
// A real campaign pitched the Self-Healing Supervisor as software that DETECTS and
// EXPLAINS incidents and never once said it REPAIRS them — which is the reason anyone
// would buy it. Nothing was hallucinated; the model simply had nothing but the free-text
// offer line from the brief, and it wrote what that line contained.
//
// The capability set is already declared, precisely, in the product manifest that the
// registry and the buyer documents both read. Retyping it into every campaign brief and
// hoping the model infers the rest is how the headline feature goes missing. So the
// manifest is resolved here and handed to the drafter as fact.
//
// The EXCLUSIONS travel with it, and that is the half that matters most: the Supervisor
// manifest excludes 'autonomous-production-repair', so telling the model what the product
// does is also telling it exactly where the claim stops. Capability without its boundary
// is how honest software acquires a dishonest pitch.

function offerProfileFor(offer: string): string {
  const needle = clean(offer, 400).toLowerCase()
  if (!needle) return ''

  // ALL of them. A campaign selling two products used to get the first one's fact sheet
  // and nothing about the second, so half the pitch was written from the offer line alone
  // — which is the exact gap that produced the monitoring emails.
  const matches = manifestsForOffer(needle)
  if (!matches.length) return ''
  return matches.map(matched => renderProductFacts(matched)).join('\n\n')
}

function renderProductFacts(matched: ReturnType<typeof manifestsForOffer>[number]): string {

  const readable = (values: readonly string[]) => values.map(v => v.replace(/[-_]/g, ' ')).join(', ')
  const lines = [
    `Product: ${matched.displayName}`,
    // THE MODEL KEPT INVENTING A CATEGORY FOR THE PRODUCT. Two real drafts called the
    // Supervisor "a monitoring software" and "a supervision software" — nouns that
    // appear nowhere in the manifest. The damage is commercial, not cosmetic: monitoring
    // is a crowded commodity category the buyer already pays someone for, so the pitch
    // files a product that DIAGNOSES AND REPAIRS under a heading where it looks like a
    // more expensive Nagios. The manifest names the product; nothing else may.
    matched.categoryLabel
      ? `Category — use THIS phrase and no other when the email needs to say what kind of software this is: "${matched.categoryLabel}". Do NOT substitute your own label. Specifically never call it monitoring software, a monitoring platform, an observability tool or a supervision system: those are commodity categories the recipient already buys from someone else, and filing this product under one of them throws away the reason to reply.`
      : `Call it by this exact name and do NOT invent a category label for it. If a category noun is needed, use the description below verbatim rather than summarising it into one.`,
    `What it does: ${matched.shortDescription}`,
    matched.longDescription ? `In more detail: ${matched.longDescription}` : '',
    matched.requiredCapabilities.length ? `Core capabilities, all of which are real and shipped: ${readable(matched.requiredCapabilities)}` : '',
    matched.optionalCapabilities.length ? `Also available: ${readable(matched.optionalCapabilities)}` : '',
    // HOW THE WORK GETS DONE. A real draft described these products as though a human
    // performed every step, when the automation IS the reason to buy — and the fact that
    // a person can seize control at any point is what makes the automation acceptable to
    // an enterprise. Both halves have to be said, so both are listed here.
    matched.executionModes?.length
      ? `How the work is executed — this is a HEADLINE selling point, not a footnote, so say it: ${readable(matched.executionModes)}. State both halves: the work runs automatically, AND a person can take control at any point. Do not describe the product as something an operator drives by hand.`
      : '',
    matched.exclusions.length ? `WHAT IT DELIBERATELY DOES NOT DO — never claim any of these: ${readable(matched.exclusions)}` : '',
    matched.targetAudience.length ? `Who it is for: ${readable(matched.targetAudience)}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

// EXPORTED so the draft-refresh path reuses this exact function. If refreshing had its
// own copy of the prompt, the two would drift and a refreshed draft would stop matching
// what new campaigns produce — which is the whole reason a refresh exists.
export async function draftMessageFor(
  job: ProspectCampaignJob,
  candidate: ProspectCandidate,
): Promise<string> {
  const languageName = LANGUAGE_NAMES[job.language] || 'English'
  const profile = offerProfileFor(job.offer)
  const systemPrompt = [
    'You write short, specific, honest B2B outreach emails that a founder would be comfortable sending under their own name.',
    'Open with the problem this specific company plausibly has, based only on what the brief says about them — never invent facts, customers, metrics, funding, headcount, or a prior conversation.',
    'NEVER STATE WHAT THE COMPANY DOES unless the brief says it in so many words. A search snippet naming an industry means the company operates in that industry SOMEHOW — it does not tell you whether they run those operations, sell software to people who do, consult on them, or report on them. A real email opened by telling a large ERP VENDOR that it "manages complex industrial manufacturing operations at a global scale"; the reader knows in one sentence that nobody looked. If you are not certain what they do, write about the problem itself and let them recognise it, which is stronger anyway.',
    'Name ONLY the recipient company. Never mention any other company by name: if the notes below happen to list other firms, they are neighbours in a search result, not context about the recipient, and naming them makes the email obviously mass-produced.',
    'Then introduce the offer as the answer. No hype, no guarantees of revenue, rankings, or results.',
    'STATE WHAT THE PRODUCT ACTUALLY DOES, including its headline capability. A description that covers only part of what the product does — for instance saying it detects a problem while omitting that it also repairs it — is a failed email, because the strongest reason to reply has been left out.',
    'If the fact sheet lists execution modes, the email MUST convey that the product runs automatically and that a human can take over at any point. Automation is why a buyer is interested and human control is why their risk team allows it; an email that implies manual operation throws both away.',
    // ── SALES VOICE, NOT ENGINEERING VOICE ────────────────────────────────────
    // A real reply to a CEO closed with a paragraph headed "two real limits" that
    // volunteered an unbuilt roadmap item. That is documentation written into a sales
    // email: it invents doubt in a reader who had not asked, and makes shipped software
    // sound unfinished. The rules below are about VOICE. They do not loosen a single
    // accuracy rule above — an email still may not claim anything the fact sheet does
    // not list, and still may not claim an excluded item. The discipline is: never
    // overclaim, and never volunteer an underclaim nobody asked for.
    'Write as a salesperson, not as an engineer. No roadmap, no internal architecture, no build status. Never write that something is "not yet implemented", "in development", "coming soon" or "still to be built", and never write a paragraph of limitations, caveats or gaps. A capability absent from the fact sheet is simply not mentioned — its absence is never announced.',
    'Every point where a person must approve or take control is a CONTROL THE BUYER GETS, and must be written that way. "High-risk actions require your sign-off while routine repairs run automatically" sells; "it cannot repair on its own" does not, and in most cases is not even true. Never phrase a safety boundary as something the product lacks.',
    'Never apologise for the product, hedge its capability, or pre-empt an objection the reader has not raised. Detail belongs in the technical session, not in an email whose only job is to earn that session.',
    'STATE EVERY BOUNDARY AS SCOPE, NEVER AS DEFICIENCY. "It acts on its own for everything except money, deletion and credentials" and "it cannot repair on its own" can describe the identical system, and only one of them sells. Bounded autonomy is still autonomy — nobody calls a head of state powerless because one decision needs a second signature. Write what the product DOES across its range, then name the reserved cases as the buyer keeping control of exactly the things they would want to keep control of.',
    'Never invent a coverage percentage, a success rate, a time saving or any other statistic to express scope. A number you cannot show the working for is the first thing a technical buyer tests, and losing that one exchange costs more than the number ever gained. Express range in terms the reader can verify: what it does, where it stops, and why.',
    'Where the fact sheet says the product PREPARES something rather than RUNS it, keep that distinction — but state it as the product doing the preparing, never as a shortfall.',
    'When a product fact sheet appears below, it is authoritative: everything it lists is real and shipped, so use it rather than inferring capability from the offer line. Never claim anything it lists as excluded.',
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
    profile ? '' : '',
    profile ? `PRODUCT FACT SHEET — authoritative, use it:\n${profile}` : '',
    '',
    'Write the outreach message now.',
  ].filter(Boolean).join('\n')

  const raw = await callModel({ modelPreference: 'claude', systemPrompt, prompt, maxTokens: 700 })
  return clean(String(raw || '').replace(/```/g, ''), 2_300)
}

// ── One company, start to finish ─────────────────────────────────────────────
//
// Pulled out of the drafting loop so a batch of companies can be run concurrently.
// It never throws: a batch is resolved with Promise.all and one company's failure must
// not discard the work of the others sharing its batch.

type UnitOutcome = { drafted: boolean; result: ProspectResult; error?: string }

async function runOneCompany(
  job: ProspectCampaignJob,
  candidate: ProspectCandidate,
): Promise<UnitOutcome> {
  const at = () => new Date().toISOString()
  try {
    const message = await withTimeout(draftMessageFor(job, candidate), 45_000, () => '')
    if (!message || message.length < 40) {
      return { drafted: false, result: { name: candidate.name, url: candidate.url, outcome: 'skipped', detail: 'Draft came back empty or too short.', at: at() } }
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
      return { drafted: true, result: { name: candidate.name, url: candidate.url, outcome: 'drafted', detail: created.contactEmail || '', at: at() } }
    }
    if (created.skipped) {
      return { drafted: false, result: { name: candidate.name, url: candidate.url, outcome: 'skipped', detail: 'No published contact email found.', at: at() } }
    }
    const error = created.error || 'Draft rejected.'
    return { drafted: false, error, result: { name: candidate.name, url: candidate.url, outcome: 'error', detail: error, at: at() } }
  } catch (err: any) {
    const error = String(err?.message || err || 'Unknown error while drafting.')
    return { drafted: false, error, result: { name: candidate.name, url: candidate.url, outcome: 'error', detail: error, at: at() } }
  }
}

// ── Advance (one worker tick) ────────────────────────────────────────────────

export async function advanceProspectCampaigns(jobId?: string): Promise<{
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

  // COS may target the job it just created. Cron calls without a job id use fair
  // least-recently-advanced scheduling, so one wedged or long-running campaign cannot
  // monopolize every tick and starve every campaign created after it.
  let claim = db
    .from(TABLE)
    .select('*')
    .in('status', ['queued', 'discovering', 'running'])

  claim = jobId
    ? claim.eq('id', jobId)
    : claim.order('updated_at', { ascending: true }).order('created_at', { ascending: true })

  const { data: claimed, error: claimError } = await claim.limit(1)

  if (claimError) return { ok: false, units: 0, error: claimError.message }
  if (!claimed || !claimed.length) return { ok: true, units: 0 }

  let job = claimed[0] as ProspectCampaignJob
  let units = 0

  // Phase 1 — discovery. Runs when the job is new OR when the waiting queue is empty
  // and the campaign still owes drafts. Discovery APPENDS to the queue; it never
  // replaces it. The previous design cleared the array to force a fresh round, which
  // collided with the drafting loop below: `processed` is a CUMULATIVE counter, and the
  // loop was using it as an INDEX into the array. After one cleared round the counter
  // pointed past the end of every fresh list, so the worker discovered forever and
  // drafted nothing — and, because the oldest unfinished job is always claimed first,
  // that one wedged campaign starved every campaign created after it. The queue below
  // is consumed from the front, so the index is always zero and the counter can never
  // collide with it again.
  const ceiling = examinedCeilingFor(job.requested_count)
  const queueEmpty = !Array.isArray(job.candidates) || !job.candidates.length
  const owesDrafts = job.drafts_created < job.requested_count
  if ((job.status === 'queued' || queueEmpty) && owesDrafts && job.processed < ceiling) {
    // Leave at least 10s of the tick for saving results and, when possible, a first
    // draft. Discovery that fills the whole tick starves the write that persists it.
    const discovery = await runDiscovery(job, Math.max(10_000, remainingMs() - 10_000))
    if (!discovery.ok) {
      // A brand-new campaign that cannot discover anything has failed. A campaign that
      // already made progress and can find nothing FURTHER is finished short of its
      // target — mark it completed with the honest count, never leave it wedged.
      const hasProgress = job.processed > 0 || job.drafts_created > 0
      const closingStatus: ProspectCampaignStatus = hasProgress ? 'completed' : 'failed'
      const closingNote = hasProgress
        ? `Stopped at ${job.drafts_created} of ${job.requested_count}. ${job.processed} companies examined, ${job.skipped} skipped — no further companies found (${discovery.error || 'discovery exhausted'}).`
        : discovery.error || 'Discovery failed.'
      await db.from(TABLE).update({
        status: closingStatus,
        last_error: closingNote,
        updated_at: new Date().toISOString(),
      }).eq('id', job.id)
      return { ok: closingStatus === 'completed', jobId: job.id, status: closingStatus, units: 0, error: discovery.error }
    }

    const existing = Array.isArray(job.candidates) ? job.candidates : []
    const merged = [...existing, ...discovery.candidates]

    const { data: updated, error: updateError } = await db.from(TABLE).update({
      status: 'running',
      candidates: merged,
      last_error: discovery.note || null,
      updated_at: new Date().toISOString(),
    }).eq('id', job.id).select('*').single()

    if (updateError) return { ok: false, jobId: job.id, units: 0, error: updateError.message }
    job = updated as ProspectCampaignJob
    units += 1
  }

  // Phase 2 — draft one company per unit, a few units per tick, always inside the
  // budget. The queue is consumed FROM THE FRONT: each unit takes candidates[0] and the
  // save at the end stores what remains. `processed` is only ever a counter now — it
  // gates the examined ceiling and the sector-query rotation, and nothing indexes with it.
  const queue: ProspectCandidate[] = Array.isArray(job.candidates) ? [...job.candidates] : []
  const results: ProspectResult[] = Array.isArray(job.results) ? [...job.results] : []
  let processed = job.processed
  let drafted = job.drafts_created
  let skipped = job.skipped
  let lastError: string | null = job.last_error

  // Companies are worked in BATCHES that run concurrently. The batch is sized by what
  // is left to do as well as by the pool, so a campaign needing two more drafts does not
  // open eight connections to get them.
  while (
    queue.length > 0 &&
    drafted < job.requested_count &&
    processed < ceiling &&
    units < MAX_UNITS_PER_TICK &&
    remainingMs() > PER_COMPANY_TIMEOUT_MS + 15_000
  ) {
    const stillNeeded = job.requested_count - drafted
    const room = Math.max(1, Math.min(
      CONCURRENCY,
      queue.length,
      MAX_UNITS_PER_TICK - units,
      ceiling - processed,
      // Roughly half of any list has no published address, so ask for about twice
      // what is still needed. This bounds the overshoot: a campaign for 30 can finish
      // a batch at 31 or 32 drafts, never at 60.
      stillNeeded * 2,
    ))

    const batch = queue.splice(0, room)
    processed += batch.length
    units += batch.length

    // Promise.all is safe here because runOneCompany never rejects — one company's
    // failure is returned as an outcome, so it cannot discard its batch-mates' work.
    const outcomes = await Promise.all(batch.map(candidate => runOneCompany(job, candidate)))

    for (const outcome of outcomes) {
      results.push(outcome.result)
      if (outcome.drafted) drafted += 1
      else skipped += 1
      if (outcome.error) lastError = outcome.error
    }
  }

  // WHEN IS A CAMPAIGN FINISHED? Three honest ends and one deliberate continuation:
  //   met      — it drafted what was asked for.
  //   ceiling  — it examined 6x the target and stops with the shortfall named, so a thin
  //              market cannot become an unbounded loop against a paid search backend.
  //   stalled  — the queue is empty and the last two dozen companies in a row produced
  //              not one draft: something systematic (crawler blocked, addresses
  //              unpublished market-wide), and another round would burn ticks repeating it.
  //   otherwise, an empty queue with the target unmet simply leaves the job 'running';
  //   the NEXT tick's Phase 1 appends a fresh round on rotated sector queries. That
  //   replaces the old clear-the-array trick with a version that cannot wedge.
  const targetMet = drafted >= job.requested_count
  const ceilingHit = processed >= ceiling
  const recent = results.slice(-24)
  const stalled = queue.length === 0 && recent.length >= 24 && !recent.some(r => r.outcome === 'drafted')
  const finished = targetMet || ceilingHit || (queue.length === 0 && stalled)
  const status: ProspectCampaignStatus = finished ? 'completed' : 'running'

  const shortfallNote = finished && !targetMet
    ? `Stopped at ${drafted} of ${job.requested_count}. ${processed} companies examined, ${skipped} skipped — most without a published contact address. Widen the region or lower the count.`
    : lastError

  const { error: saveError } = await db.from(TABLE).update({
    status,
    results: results.slice(-60),
    processed,
    // What remains of the queue, after this tick consumed from the front. An empty
    // queue on an unfinished job is the signal the next tick reads to run discovery.
    candidates: queue,
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
    `${job.processed} companies examined, ${Array.isArray(job.candidates) ? job.candidates.length : 0} waiting in the queue`,
    job.last_error ? `Last error: ${job.last_error}` : '',
  ].filter(Boolean)
  return parts.join('. ').replace(/\.\./g, '.')
}