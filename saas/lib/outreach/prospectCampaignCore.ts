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
const MAX_REQUESTED = 500
const MIN_CANDIDATES = 24
const MAX_CANDIDATES_PER_ROUND = 60
function candidateTargetFor(requested: number): number {
  return Math.min(MAX_CANDIDATES_PER_ROUND, Math.max(MIN_CANDIDATES, requested * 3))
}
function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name])
  if (!Number.isFinite(raw) || raw <= 0) return fallback
  return Math.max(min, Math.min(max, Math.floor(raw)))
}
const CONCURRENCY = envInt('OUTREACH_CAMPAIGN_CONCURRENCY', 8, 1, 40)
const MAX_UNITS_PER_TICK = envInt('OUTREACH_CAMPAIGN_UNITS_PER_TICK', 60, 1, 400)
function examinedCeilingFor(requested: number): number {
  return Math.max(120, requested * 6)
}
const TICK_BUDGET_MS = 240_000
const PER_COMPANY_TIMEOUT_MS = 70_000

function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise<T>(resolve => {
    const timer = setTimeout(() => resolve(onTimeout()), ms)
    work.then(value => { clearTimeout(timer); resolve(value) })
        .catch(() => { clearTimeout(timer); resolve(onTimeout()) })
  })
}

const EXCLUDED_HOST_FRAGMENTS = [
  'signalboostapp.com', 'wikipedia.org', 'linkedin.com', 'facebook.com', 'twitter.com',
  'x.com', 'instagram.com', 'youtube.com', 'reddit.com', 'medium.com', 'github.com',
  'crunchbase.com', 'g2.com', 'capterra.com', 'clutch.co', 'glassdoor.com', 'indeed.com',
  'gartner.com', 'forbes.com', 'techcrunch.com', 'quora.com', 'yelp.com',
  'designrush.com', 'goodfirms.co', 'themanifest.com', 'sortlist.com', 'upcity.com',
  'expertise.com', 'trustradius.com', 'softwaresuggest.com', 'techreviewer.co',
  'superbcompanies.com', 'cloudtango.net', 'gocorptech.com', 'itfirms.co', 'selectedfirms.co',
  'topdevelopers.co', 'businessofapps.com', 'producthunt.com', 'g2crowd.com', 'owler.com',
  'zoominfo.com', 'apollo.io', 'similarweb.com', 'statista.com', 'wellfound.com',
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
  const round = Math.floor(Number(job.processed || 0) / 6)
  const sectors = sectorQueriesFor(job, place)
  const rotated = sectors.slice((round * 4) % sectors.length).concat(sectors.slice(0, (round * 4) % sectors.length))

  if (profile) {
    return [...profile.terms.slice(0, 3).map(term => clean(`${term} ${place}`, 120)), ...rotated].slice(0, 9)
  }

  const phrases = job.target_criteria
    .split(/[,;\u2014\u2013]/)
    .map(part => clean(part, 60))
    .filter(part => part.length > 8)
    .slice(0, 3)
  const base = phrases.length ? phrases : [clean(job.target_criteria, 60)]
  return [...base.map(phrase => clean(place ? `${phrase} ${place}` : phrase, 120)), ...rotated].slice(0, 9)
}

const AGGREGATOR_HOST_HINTS = [
  'directory', 'directories', 'companies', 'firms', 'providers', 'database', 'ranking',
  'rankings', 'toplist', 'top-', 'best-', 'listing', 'listings', 'compare', 'reviews',
]
const AGGREGATOR_TITLE_HINTS = /\b(top\s*\d+|best\s+\d+|\d+\s+best|\d+\s+top|comparison|independent comparison|database|directory|ranking|list of|guide to|roundup)\b/i
const SUPERLATIVE_LIST = /\b(top|best|leading|largest|greatest|fastest[- ]growing|most popular)\b[^.]{0,60}\b(companies|company|providers|provider|firms|agencies|agency|consultancies|consultants|vendors|partners|platforms|tools|solutions|services|developers|shops)\b/i
const DATED_ARTICLE = /\b(20\d{2})\b[^.]{0,20}\b(guide|edition|list|ranking|review|report)\b|\b(guide|edition|list|ranking|review|report)\b[^.]{0,20}\b(20\d{2})\b/i

function looksLikeAggregator(host: string, title: string): boolean {
  if (AGGREGATOR_HOST_HINTS.some(hint => host.includes(hint))) return true
  if (AGGREGATOR_TITLE_HINTS.test(title)) return true
  if (SUPERLATIVE_LIST.test(title)) return true
  return DATED_ARTICLE.test(title)
}

function companyNameFrom(title: string, host: string): string {
  const root = host.split('.')[0] || host
  const squash = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const rootKey = squash(root)

  const segments = String(title || '').split(/[|\u2013\u2014\u00b7:]|\s-\s/)
  for (const segment of segments) {
    const candidate = clean(segment, 160)
    if (!candidate) continue
    const key = squash(candidate)
    if (!key) continue
    if (key.includes(rootKey) || rootKey.includes(key)) return candidate
  }

  const readable = root.replace(/[-_]+/g, ' ').trim()
  return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : host
}

function candidateFrom(result: { title: string; url: string; snippet: string }): ProspectCandidate | null {
  const host = hostOf(result.url)
  if (!host) return null
  if (EXCLUDED_HOST_FRAGMENTS.some(fragment => host === fragment || host.endsWith(`.${fragment}`))) return null
  if (looksLikeAggregator(host, String(result.title || ''))) return null
  const url = `https://${host}`
  return { name: companyNameFrom(String(result.title || ''), host), url, snippet: clean(result.snippet, 400) }
}

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

async function knownHosts(db: ReturnType<typeof admin>, wantedProduct: string | null): Promise<Set<string>> {
  const known = new Set<string>()
  if (!db) return known
  const { data } = await db
    .from('outreach_queue')
    .select('business_url,product_key')
    .limit(2_000)
  for (const row of data || []) {
    if (productKeyOf(String((row as any)?.product_key || '')) !== wantedProduct) continue
    const host = hostOf(String(row?.business_url || ''))
    if (host) known.add(host)
  }
  return known
}

async function runDiscovery(
  job: ProspectCampaignJob,
  budgetMs: number,
): Promise<{ ok: boolean; candidates: ProspectCandidate[]; error?: string; note?: string }> {
  const startedAt = Date.now()
  const timeLeft = () => budgetMs - (Date.now() - startedAt)
  const seen = await knownHosts(admin(), productKeyOf(job.offer))
  const target = candidateTargetFor(job.requested_count)
  const matched: ProspectCandidate[] = []
  const unknown: ProspectCandidate[] = []
  const elsewhere: ProspectCandidate[] = []
  let lastError = ''

  for (const previous of Array.isArray(job.results) ? job.results : []) {
    const host = hostOf(String((previous as ProspectResult)?.url || ''))
    if (host) seen.add(host)
  }
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
        if (signal === 'other') elsewhere.push(candidate)
        else matched.push(candidate)
      }
    } else if (!matched.length && github.error) {
      lastError = lastError || github.error
    }
  }

  const ordered = [...matched, ...unknown, ...elsewhere].slice(0, target)
  if (!ordered.length) return { ok: false, candidates: [], error: lastError || 'No usable company sites in the search results.' }

  const note = matched.length
    ? undefined
    : `No result confirmed in region "${normalizeRegion(job.region)}"; proceeding with unconfirmed results.`
  return { ok: true, candidates: ordered, note }
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', pt: 'Portuguese', pl: 'Polish', ru: 'Russian',
}

function offerProfileFor(offer: string): string {
  const needle = clean(offer, 400).toLowerCase()
  if (!needle) return ''
  const matches = manifestsForOffer(needle)
  if (!matches.length) return ''
  return matches.map(matched => renderProductFacts(matched)).join('\n\n')
}

function renderProductFacts(matched: ReturnType<typeof manifestsForOffer>[number]): string {
  const readable = (values: readonly string[]) => values.map(v => v.replace(/[-_]/g, ' ')).join(', ')
  const lines = [
    `Product: ${matched.displayName}`,
    matched.categoryLabel
      ? `Category — use THIS phrase and no other when the email needs to say what kind of software this is: "${matched.categoryLabel}". Do NOT substitute your own label. Specifically never call it monitoring software, a monitoring platform, an observability tool or a supervision system: those are commodity categories the recipient already buys from someone else, and filing this product under one of them throws away the reason to reply.`
      : `Call it by this exact name and do NOT invent a category label for it. If a category noun is needed, use the description below verbatim rather than summarising it into one.`,
    `What it does: ${matched.shortDescription}`,
    matched.longDescription ? `In more detail: ${matched.longDescription}` : '',
    matched.requiredCapabilities.length ? `Core capabilities, all of which are real and shipped: ${readable(matched.requiredCapabilities)}` : '',
    matched.optionalCapabilities.length ? `Also available: ${readable(matched.optionalCapabilities)}` : '',
    matched.executionModes?.length
      ? `How the work is executed — this is a HEADLINE selling point, not a footnote, so say it: ${readable(matched.executionModes)}. State both halves: the work runs automatically, AND a person can take control at any point. Do not describe the product as something an operator drives by hand.`
      : '',
    matched.exclusions.length ? `WHAT IT DELIBERATELY DOES NOT DO — never claim any of these: ${readable(matched.exclusions)}` : '',
    matched.targetAudience.length ? `Who it is for: ${readable(matched.targetAudience)}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

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

    const created = await withTimeout(
      createOutreachDraft({ businessName: candidate.name, businessUrl: candidate.url, message, senderKey: 'saasSales', productKey: job.offer }),
      PER_COMPANY_TIMEOUT_MS - 45_000,
      () => ({ ok: false, skipped: true, error: 'Timed out while looking for a published email.' } as any),
    )

    if (created.ok) {
      return { drafted: true, result: { name: candidate.name, url: candidate.url, outcome: 'drafted', detail: created.contactEmail || '', at: at() } }
    }
    if (created.skipped) {
      const detail = created.error || 'Skipped without a specific reason.'
      return { drafted: false, result: { name: candidate.name, url: candidate.url, outcome: 'skipped', detail, at: at() } }
    }
    const error = created.error || 'Draft rejected.'
    return { drafted: false, error, result: { name: candidate.name, url: candidate.url, outcome: 'error', detail: error, at: at() } }
  } catch (err: any) {
    const error = String(err?.message || err || 'Unknown error while drafting.')
    return { drafted: false, error, result: { name: candidate.name, url: candidate.url, outcome: 'error', detail: error, at: at() } }
  }
}

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

  const ceiling = examinedCeilingFor(job.requested_count)
  const queueEmpty = !Array.isArray(job.candidates) || !job.candidates.length
  const owesDrafts = job.drafts_created < job.requested_count
  if ((job.status === 'queued' || queueEmpty) && owesDrafts && job.processed < ceiling) {
    const discovery = await runDiscovery(job, Math.max(10_000, remainingMs() - 10_000))
    if (!discovery.ok) {
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

  const queue: ProspectCandidate[] = Array.isArray(job.candidates) ? [...job.candidates] : []
  const results: ProspectResult[] = Array.isArray(job.results) ? [...job.results] : []
  let processed = job.processed
  let drafted = job.drafts_created
  let skipped = job.skipped
  let lastError: string | null = job.last_error

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
      stillNeeded * 2,
    ))

    const batch = queue.splice(0, room)
    processed += batch.length
    units += batch.length

    const outcomes = await Promise.all(batch.map(candidate => runOneCompany(job, candidate)))

    for (const outcome of outcomes) {
      results.push(outcome.result)
      if (outcome.drafted) drafted += 1
      else skipped += 1
      if (outcome.error) lastError = outcome.error
    }
  }

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
