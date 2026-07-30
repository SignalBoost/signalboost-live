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

const TABLE = 'prospect_campaign_jobs'
const MAX_REQUESTED = 25
const MAX_CANDIDATES = 12
const MAX_UNITS_PER_TICK = 3
const TICK_BUDGET_MS = 45_000

// Never prospect ourselves, and never burn a slot on a directory or aggregator page:
// those pass a naive "looks like a company site" check and waste a whole tick.
const EXCLUDED_HOST_FRAGMENTS = [
  'signalboostapp.com', 'wikipedia.org', 'linkedin.com', 'facebook.com', 'twitter.com',
  'x.com', 'instagram.com', 'youtube.com', 'reddit.com', 'medium.com', 'github.com',
  'crunchbase.com', 'g2.com', 'capterra.com', 'clutch.co', 'glassdoor.com', 'indeed.com',
  'gartner.com', 'forbes.com', 'techcrunch.com', 'quora.com', 'yelp.com',
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

  const requested = Math.max(1, Math.min(Number(input.requestedCount) || 5, MAX_REQUESTED))
  const language = ['en', 'es', 'pt', 'pl', 'ru'].includes(String(input.language))
    ? String(input.language)
    : 'en'

  const { data, error } = await db
    .from(TABLE)
    .insert({
      created_by: input.createdBy || null,
      status: 'queued',
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

function searchQueryFor(job: ProspectCampaignJob): string {
  return clean(`${job.target_criteria} ${job.region || ''} company website`, 380)
}

function candidateFrom(result: { title: string; url: string; snippet: string }): ProspectCandidate | null {
  const host = hostOf(result.url)
  if (!host) return null
  if (EXCLUDED_HOST_FRAGMENTS.some(fragment => host === fragment || host.endsWith(`.${fragment}`))) return null
  // Prefer the company's root site over a deep blog/article URL: the email finder and
  // the analyzer both work far better against a homepage.
  const url = `https://${host}`
  const name = clean(result.title.split(/[|\u2013\u2014-]/)[0], 160) || host
  return { name, url, snippet: clean(result.snippet, 400) }
}

async function runDiscovery(
  job: ProspectCampaignJob,
): Promise<{ ok: boolean; candidates: ProspectCandidate[]; error?: string }> {
  const search = await getExternalInfo(searchQueryFor(job), MAX_CANDIDATES)
  if (!search.ok) return { ok: false, candidates: [], error: search.error || 'Search returned no results.' }

  const seen = new Set<string>()
  const candidates: ProspectCandidate[] = []
  for (const result of search.results) {
    const candidate = candidateFrom(result)
    if (!candidate) continue
    const host = hostOf(candidate.url)
    if (seen.has(host)) continue
    seen.add(host)
    candidates.push(candidate)
  }

  if (!candidates.length) return { ok: false, candidates: [], error: 'No usable company sites in the search results.' }
  return { ok: true, candidates }
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
    const discovery = await runDiscovery(job)
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
      last_error: null,
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
    remainingMs() > 15_000
  ) {
    const candidate = candidates[processed]
    processed += 1
    units += 1

    try {
      const message = await draftMessageFor(job, candidate)
      if (!message || message.length < 40) {
        skipped += 1
        results.push({ name: candidate.name, url: candidate.url, outcome: 'skipped', detail: 'Draft came back empty or too short.', at: new Date().toISOString() })
        continue
      }

      // Reused unchanged: finds a REAL published email or skips, localizes to the
      // target's region, appends the compliance footer, inserts as 'pending'.
      const created = await createOutreachDraft({
        businessName: candidate.name,
        businessUrl: candidate.url,
        message,
        senderKey: 'saasSales',
      })

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

  const finished = drafted >= job.requested_count || processed >= candidates.length
  const status: ProspectCampaignStatus = finished ? 'completed' : 'running'

  const { error: saveError } = await db.from(TABLE).update({
    status,
    results: results.slice(-60),
    processed,
    drafts_created: drafted,
    skipped,
    last_error: lastError,
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
