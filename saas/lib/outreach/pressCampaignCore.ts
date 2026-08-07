// saas/lib/outreach/pressCampaign.ts
//
// BACKGROUND PRESS CAMPAIGNS — the press equivalent of prospectCampaign.ts.
//
// WHY THIS EXISTS, stated plainly because it took five rounds to find:
//
// The owner asked for thirty publications, repeatedly, and repeatedly received a
// polished document and an empty cockpit. The tools were fine. The forcing was
// eventually fine. What was never fine was the PLACE the work was being done: a
// single bounded chat turn, abandoned at 260 seconds. Thirty outlets means one live
// web crawl plus thirty AI-written releases. That does not fit, has never fitted,
// and cannot be made to fit by writing a better prompt.
//
// Sales hit this exact wall in July and moved out of the turn into a durable job.
// This is that, for press. The chat turn writes one row and returns a job id in
// about a second; the worker drafts a few outlets per tick and the drafts accumulate
// in the cockpit. Progress lives in the database, so a dead HTTP request costs
// nothing but the tick it was in.
//
// WHAT IT DOES NOT DO — and this is the part that must never drift:
//
//   · it never sends. Its only output is press_campaigns rows in pending_owner_review.
//   · it never invents an outlet or an editor address. Candidates come from
//     discoverPublishers, which reads each outlet's own site; a candidate without a
//     real contact is SKIPPED WITH A REASON, never filled in with a plausible guess.
//   · it never bypasses a gate. Drafting goes through createPressCampaignFromAgent,
//     the same entry point the cockpit form uses, so target validation, the
//     paid-claim refusal, company facts and the approval requirement all still apply.
//
// A background job changes WHEN the work happens. It changes nothing about who
// authorises the sending.

import { createClient } from '@supabase/supabase-js'
import { discoverPublishers } from '@/lib/marketing/publisherDiscovery'
import { createPressCampaignFromAgent } from '@/lib/ai/tools/pressCampaign'
import { checkPressAdmission } from '@/lib/marketing/pressCampaignAdmission'

const TABLE = 'press_campaign_jobs'

// One outlet costs a search-free AI release generation, a few seconds each. Six per
// tick leaves headroom inside a 60s cron invocation for the discovery phase and the
// write that persists it — a tick that spends its whole budget drafting and dies
// before saving has done the work twice for nothing.
const TICK_BUDGET_MS = 50_000
const DRAFTS_PER_TICK = 6
const MAX_REQUESTED = 40
const LANGS = ['en', 'es', 'pt', 'pl', 'ru']

export type PressCampaignStatus =
  | 'queued' | 'discovering' | 'running' | 'completed' | 'failed' | 'cancelled'

export type PressCandidate = {
  publicationName: string
  editorContact: string
  method: 'email' | 'online_form'
  sourceUrl: string
}

export type PressJobResult = {
  publicationName: string
  // The contact is recorded so the de-dupe key is the SAME on both sides. It was the name
  // on results and the address on candidates, so an outlet already drafted never matched a
  // freshly discovered one and every discovery round re-added the whole list — which is why
  // the cockpit showed the same address four and five times over.
  editorContact?: string
  queued: boolean
  campaignId?: string
  reason?: string
}

export type PressCampaignJob = {
  id: string
  created_by: string | null
  status: PressCampaignStatus
  goal: string
  region: string | null
  channel: string
  language: string
  audience: string | null
  cta_url: string | null
  requested_count: number
  // The owner's ORIGINAL words, kept for SEARCHING. `goal` is the announcement a release is
  // written around; this is the brief an outlet search is run against. They are different
  // jobs and they need different text — see createPressCampaignJob.
  search_brief: string | null
  candidates: PressCandidate[]
  results: PressJobResult[]
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

// The owner's message is a WORK ORDER; a release announces a PRODUCT. Pull the second out
// of the first. "The campaign will promote: 1. X 2. Y" is the shape he uses, and it is the
// shape any brief takes once the research instructions are stripped. When nothing can be
// extracted the whole text is kept — a slightly wordy goal is recoverable, a wrong one is not.
export function announcementFrom(brief: string): string {
  const text = String(brief || '')
  const promote = text.match(/(?:will\s+)?promote[sd]?\s*:?\s*([\s\S]{0,400})/i)
  // HIS BRIEF ARRIVES AS ONE LINE. Pasted into the chat widget the newlines are gone, so
  // "1. Self-Healing Supervisor 2. SignalBoost AI Marketing and Sales Software Use your
  // existing knowledge…" splits into two items, the second of which carries the whole rest
  // of the instruction, runs past the length filter and is DROPPED — which is why a
  // two-product campaign announced one product. Cut the capture at the first instruction
  // word before splitting, so the run-on tail never joins the last product.
  const promoted = promote
    ? promote[1].split(/\b(?:use your|clearly explain|emphas|explain\b|which industries|why the)/i)[0]
    : ''
  const products = promoted
    ? promoted
        .split(/\n|\d+\.\s+|\s+and\s+(?=[A-Z])/)
        .map(l => l.replace(/^[\s*\-•]+/, '').replace(/[.,;]+$/, '').trim())
        .filter(l => l && l.length < 120 && !/^(use|clearly|emphas|explain|which|why|how|what)/i.test(l))
        .slice(0, 6)
    : []
  if (products.length) {
    return clean(`Announce ${products.join(' and ')} to the press.`, 400)
  }
  // Strip an obvious research instruction opening, keep the rest.
  const stripped = text.replace(/^[\s\S]{0,200}?\b(?:research|identify|find|list)\b[^.\n]*[.\n]/i, '').trim()
  return clean(stripped || text, 600)
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createPressCampaignJob(input: {
  goal: string
  region?: string | null
  channel?: string | null
  language?: string | null
  audience?: string | null
  ctaUrl?: string | null
  requestedCount?: number
  createdBy?: string | null
}): Promise<{ ok: boolean; job?: PressCampaignJob; error?: string; capNote?: string; duplicateOf?: boolean }> {
  const db = admin()
  if (!db) return { ok: false, error: 'Supabase service role is not configured.' }

  const goal = clean(input.goal, 2_000)
  if (!goal) return { ok: false, error: 'A goal is required — what should the release announce?' }
  // The RELEASE goal is not the OWNER'S INSTRUCTION. He typed "Research and identify 30 real
  // publications…", and that sentence became the announcement every release was written
  // around and the title on every card in the cockpit. An instruction to go and find outlets
  // is not a thing to announce to an editor. announcementFrom() keeps what the campaign is
  // PROMOTING and discards the research framing; the full brief is still stored on the job.
  const announcement = announcementFrom(goal)

  const asked = Math.max(1, Number(input.requestedCount) || 10)
  const requested = Math.min(asked, MAX_REQUESTED)
  // Visible, never silent. If the cap ever bites, the owner reads it on the job
  // rather than counting drafts and wondering where the rest went.
  const capNote = requested < asked
    ? `Asked for ${asked}; this worker runs at most ${MAX_REQUESTED} outlets per job, so it is running ${requested}. Start a second job for the rest.`
    : undefined

  const language = LANGS.includes(String(input.language)) ? String(input.language) : 'en'

  // ONE LIVE JOB PER BRIEF.
  //
  // The owner re-sent the same 30-publication request while the first job was still
  // working and got a second job id. Both would have searched the same outlets and
  // drafted the same releases, so the cockpit would fill with pairs — and the only way
  // to tell an accidental duplicate from a deliberate second push is to ask, which is
  // exactly what he should not have to do. A repeat of a brief that is already running
  // returns THE RUNNING JOB rather than starting a rival to it.
  //
  // Deliberate re-runs are still possible: finish or cancel the first, and the same
  // brief starts fresh. Nothing here blocks a genuinely different campaign — the match
  // is on the brief text, not on "a press job exists".
  try {
    const { data: live } = await db
      .from(TABLE)
      .select('*')
      .in('status', ['queued', 'discovering', 'running'])
      .order('created_at', { ascending: true })
    const duplicate = (live || []).find((row: any) => clean(row?.goal, 2_000) === goal)
    if (duplicate) {
      return {
        ok: true,
        job: duplicate as PressCampaignJob,
        duplicateOf: true,
        capNote: `This brief is already running as job ${duplicate.id} (${duplicate.drafts_created || 0} of ${duplicate.requested_count} drafts queued so far). Reusing it rather than starting a second campaign against the same outlets.`,
      }
    }
  } catch { /* the guard is best-effort; a read failure must never block a real job */ }

  const { data, error } = await db
    .from(TABLE)
    .insert({
      created_by: input.createdBy || null,
      status: 'queued',
      goal: announcement,
      // WHY BOTH ARE STORED, and it cost two empty jobs to learn.
      //
      // announcementFrom() correctly reduced "Research and identify 30 real publications
      // including online newspapers, IT and technology magazines, cloud, SaaS, DevOps, SRE,
      // MSP and cybersecurity publications… promote 1. Self-Healing Supervisor 2. …" down to
      // "Announce Self-Healing Supervisor and SignalBoost AI Marketing and Sales Software to
      // the press." That is the right ANNOUNCEMENT — and a terrible SEARCH QUERY. Every word
      // that told the finder which trade press to look for was in the part that got stripped,
      // so discovery went looking for "press" in general and came back with letters-to-the-
      // editor guides, which the admission gate then correctly refused. Two jobs in a row
      // queued nothing while every layer behaved exactly as designed.
      search_brief: goal,
      region: input.region ? clean(input.region, 200) : null,
      channel: clean(input.channel, 60) || 'digital_press',
      language,
      audience: input.audience ? clean(input.audience, 400) : null,
      cta_url: input.ctaUrl ? clean(input.ctaUrl, 400) : null,
      requested_count: requested,
      last_error: capNote || null,
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, job: data as PressCampaignJob, capNote }
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getPressCampaignJob(
  id: string,
): Promise<{ ok: boolean; job?: PressCampaignJob; error?: string }> {
  const db = admin()
  if (!db) return { ok: false, error: 'Supabase service role is not configured.' }
  const { data, error } = await db.from(TABLE).select('*').eq('id', id).single()
  if (error || !data) return { ok: false, error: error?.message || 'Press campaign job not found.' }
  return { ok: true, job: data as PressCampaignJob }
}

export async function listPressCampaignJobs(
  limit = 10,
): Promise<{ ok: boolean; jobs: PressCampaignJob[]; error?: string }> {
  const db = admin()
  if (!db) return { ok: false, jobs: [], error: 'Supabase service role is not configured.' }
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 50)))
  if (error) return { ok: false, jobs: [], error: error.message }
  return { ok: true, jobs: (data || []) as PressCampaignJob[] }
}

export async function cancelPressCampaignJob(id: string): Promise<{ ok: boolean; error?: string }> {
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

// ── Worker ───────────────────────────────────────────────────────────────────

function candidateFrom(p: {
  publicationName?: string
  editorContact?: string
  method?: 'email' | 'online_form'
  sourceUrl?: string
}): PressCandidate | null {
  const publicationName = clean(p.publicationName, 200)
  const editorContact = clean(p.editorContact, 400)
  // No contact, no candidate. The alternative — carrying it forward and letting the
  // drafting step "work something out" — is how an invented address reaches an editor.
  if (!publicationName || !editorContact) return null
  return {
    publicationName,
    editorContact,
    method: p.method === 'online_form' ? 'online_form' : 'email',
    sourceUrl: clean(p.sourceUrl, 500),
  }
}

async function runDiscovery(
  job: PressCampaignJob,
  budgetMs: number,
): Promise<{ ok: boolean; candidates: PressCandidate[]; examined: number; error?: string }> {
  const remaining = Math.max(1, job.requested_count - job.drafts_created)
  const found = await discoverPublishers({
    // The owner's own words, which name the sectors. Falls back to the announcement only for
    // jobs created before this column existed.
    brief: job.search_brief || job.goal,
    channel: job.channel,
    region: job.region,
    // discoverPublishers caps itself at 20; ask only for what is still owed.
    limit: Math.min(20, remaining),
    budgetMs,
  })
  if (!found.ok) {
    return { ok: false, candidates: [], examined: found.examined || 0, error: found.error || 'search returned nothing usable' }
  }

  const seen = new Set((job.candidates || []).map(c => String(c.editorContact || '').toLowerCase()))
  for (const r of job.results || []) {
    const contact = String(r.editorContact || '').toLowerCase()
    if (contact) seen.add(contact)
  }

  const candidates: PressCandidate[] = []
  for (const p of found.publishers || []) {
    const candidate = candidateFrom(p)
    if (!candidate) continue
    const key = candidate.editorContact.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(candidate)
  }
  return { ok: true, candidates, examined: found.examined || 0 }
}

async function draftOne(job: PressCampaignJob, candidate: PressCandidate): Promise<PressJobResult> {
  // THE SAME ADMISSION GATE THE COCKPIT FORM RUNS. Without it this path admitted a wikiHow
  // stylesheet URL, an advocacy organisation's press address and three newspaper
  // letters-to-the-editor inboxes as though they were technology press. Discovery finding an
  // address is not the same as that address being a publication that takes this story.
  const admission = checkPressAdmission({
    publicationName: candidate.publicationName,
    publicationUrl: candidate.sourceUrl,
    editorEmail: candidate.method === 'email' ? candidate.editorContact : '',
    submissionFormUrl: candidate.method === 'online_form' ? candidate.editorContact : '',
    articleNotes: job.goal,
  })
  if (!admission.admitted) {
    return {
      publicationName: candidate.publicationName,
      editorContact: candidate.editorContact,
      queued: false,
      reason: admission.refusals[0] || 'refused by the press admission rules',
    }
  }

  try {
    const result = await createPressCampaignFromAgent({
      goal: job.goal,
      publicationName: candidate.publicationName,
      editorEmail: candidate.method === 'email' ? candidate.editorContact : undefined,
      submitFormUrl: candidate.method === 'online_form' ? candidate.editorContact : undefined,
      mediaTargetType: job.channel,
      audience: job.audience || undefined,
      ctaUrl: job.cta_url || undefined,
      language: job.language,
    })
    if (!result.ok) {
      return {
        publicationName: candidate.publicationName,
        editorContact: candidate.editorContact,
        queued: false,
        reason: result.error || result.reason || 'the press engine refused this target',
      }
    }
    return { publicationName: candidate.publicationName, editorContact: candidate.editorContact, queued: true, campaignId: result.campaignId }
  } catch (error) {
    // A thrown draft is one outlet skipped with a reason, never a dead job.
    return {
      publicationName: candidate.publicationName,
      editorContact: candidate.editorContact,
      queued: false,
      reason: error instanceof Error ? error.message : 'drafting threw',
    }
  }
}

export async function advancePressCampaigns(): Promise<{
  ok: boolean
  jobId?: string
  status?: PressCampaignStatus
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

  const job = claimed[0] as PressCampaignJob
  const queue: PressCandidate[] = Array.isArray(job.candidates) ? [...job.candidates] : []
  const results: PressJobResult[] = Array.isArray(job.results) ? [...job.results] : []
  let drafts = job.drafts_created || 0
  let skipped = job.skipped || 0
  let processed = job.processed || 0
  let units = 0
  let lastError: string | null = job.last_error || null

  const owes = () => drafts < job.requested_count

  // Phase 1 — discovery. Runs when the job is new, or when the queue has run dry and
  // the campaign still owes drafts. It APPENDS; it never clears. The queue is consumed
  // from the FRONT, so no cumulative counter is ever used as an index into it — that
  // collision is what once made the prospect worker discover forever and draft nothing.
  if (owes() && !queue.length) {
    await db.from(TABLE).update({ status: 'discovering', updated_at: new Date().toISOString() }).eq('id', job.id)
    const discovery = await runDiscovery(job, Math.max(10_000, remainingMs() - 15_000))
    if (!discovery.ok || !discovery.candidates.length) {
      // A job that has already produced drafts and can find nothing FURTHER is finished
      // short of target — completed with an honest count. A job that has produced
      // nothing at all and can find nothing has genuinely failed. Neither is left wedged.
      const hasProgress = drafts > 0
      const note = discovery.error
        ? `Publication search: ${discovery.error}.`
        : 'The publication search returned no further outlets with a verified contact.'
      await db.from(TABLE).update({
        status: hasProgress ? 'completed' : 'failed',
        last_error: note,
        updated_at: new Date().toISOString(),
      }).eq('id', job.id)
      return { ok: true, jobId: job.id, status: hasProgress ? 'completed' : 'failed', units: 0, error: note }
    }
    queue.push(...discovery.candidates)
    lastError = null
  }

  // Phase 2 — drafting, a few outlets per tick, front of the queue first.
  await db.from(TABLE).update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', job.id)

  while (queue.length && owes() && units < DRAFTS_PER_TICK && remainingMs() > 12_000) {
    const candidate = queue.shift() as PressCandidate
    const result = await draftOne(job, candidate)
    results.push(result)
    processed += 1
    units += 1
    if (result.queued) drafts += 1
    else { skipped += 1; lastError = `${candidate.publicationName}: ${result.reason || 'skipped'}` }
  }

  const finished = !owes() || (!queue.length && !remainingMs())
  const status: PressCampaignStatus = !owes() ? 'completed' : 'running'

  const { error: saveError } = await db.from(TABLE).update({
    status,
    candidates: queue,
    results,
    processed,
    drafts_created: drafts,
    skipped,
    last_error: lastError,
    updated_at: new Date().toISOString(),
  }).eq('id', job.id)

  if (saveError) return { ok: false, jobId: job.id, units, error: saveError.message }
  return { ok: true, jobId: job.id, status: finished ? 'completed' : status, units }
}

// ── Owner-facing summary ─────────────────────────────────────────────────────

/** One honest paragraph about a job, safe to show the owner verbatim. */
export function describePressCampaignJob(job: PressCampaignJob): string {
  const parts = [
    `Press campaign job ${job.id} — ${job.status}.`,
    `${job.drafts_created} of ${job.requested_count} drafts queued`,
    job.skipped ? `, ${job.skipped} outlets skipped` : '',
    '. Nothing has been sent; every draft waits for approval at /dashboard/marketing/press-drafts.',
  ]
  const skippedLines = (job.results || [])
    .filter(r => !r.queued)
    .slice(0, 10)
    .map(r => `- skipped ${r.publicationName}: ${r.reason || 'no reason recorded'}`)
  return [parts.join(''), ...(skippedLines.length ? ['', 'Skipped:', ...skippedLines] : [])].join('\n')
}

// ── Request parsing ──────────────────────────────────────────────────────────
//
// The concierge route calls this DIRECTLY, before any model runs, for the same reason
// sales does: the decision "is this a durable job?" must not itself depend on a model
// call that can time out. A near miss is reported rather than silently answered as a
// question — the owner discovering an empty cockpit is the failure mode this whole
// area has been fighting.

const PRESS_WORDS = /\b(press|publication|publications|publisher|publishers|magazine|magazines|newspaper|newspapers|journal|journals|editor|editors|editorial|newsroom|trade press|media outlet|media outlets|imprensa|jornal|jornais|revista|revistas|prensa|peri(ó|o)dico|prasa|gazeta|пресс\\w*|газет\\w*|журнал\\w*)\b/i
const PRESS_ACTION_WORDS = /\b(research|identify|find|list|queue|pitch|prepare|prepar\w*|create|draft|launch|start|run|build|contact|submit|encontr\w*|criar?|montar?|znajd\w*|przygotu\w*|найд\w*|подготов\w*)\b/i
const PRESS_COUNT = /\b(\d{1,3})\s+(?:real\s+|verified\s+|top\s+)?(?:publications?|outlets?|newspapers?|magazines?|journals?|media|publica(ç|c)(õ|o)es|revistas?|jornais?|gazet\w*|издани\w*)\b/i
const REGIONS = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Ireland', 'New Zealand',
  'Mexico', 'Spain', 'Brazil', 'Portugal', 'Poland', 'Germany', 'France', 'Italy',
  'Netherlands', 'India', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Russia',
]

export type PressCampaignRequest = {
  goal: string
  region: string | null
  requestedCount: number
  language: string
}

/** A press-campaign brief, or null when the message is not one. */
export function parsePressCampaignRequest(input: string, language = 'en'): PressCampaignRequest | null {
  const text = String(input || '')
  if (!text.trim()) return null
  if (!PRESS_WORDS.test(text) || !PRESS_ACTION_WORDS.test(text)) return null

  const countMatch = text.match(PRESS_COUNT)
  const requestedCount = countMatch ? Math.max(1, Number(countMatch[1]) || 0) : 0
  // A count is what makes this a JOB rather than a question. "Pitch The Guardian" is
  // one outlet and belongs in the ordinary turn; "find 30 publications" cannot fit in one.
  if (requestedCount < 3) return null

  const region = REGIONS.find(r => new RegExp(`\\b${r}\\b`, 'i').test(text)) || null

  return {
    goal: clean(text, 2_000),
    region,
    requestedCount,
    language: LANGS.includes(String(language)) ? String(language) : 'en',
  }
}

// THE ADDRESS COS GIVES MUST BE THE ADDRESS THE OWNER USES. Two surfaces read the same
// press_campaigns rows: the COCKPIT (/press-providers) which is provider setup plus a queue,
// and the DRAFT QUEUE (/press-drafts) which is only the drafts. He asked for the second and
// it is what the navbar now points at, so every message that names a place names that one.
// Sending someone to the page where the work is buried is the same defect as burying it.
/** The reply the owner sees the moment the job is queued. */
export function pressCampaignQueuedReply(args: {
  jobId: string
  requestedCount: number
  region: string | null
  capNote?: string
  duplicateOf?: boolean
}): string {
  return [
    args.duplicateOf
      ? `This brief is ALREADY RUNNING — job ${args.jobId}, target ${args.requestedCount} publications${args.region ? ` in ${args.region}` : ''}. No second campaign was started.`
      : `Press campaign job QUEUED — id ${args.jobId}, target ${args.requestedCount} publications${args.region ? ` in ${args.region}` : ''}.`,
    '',
    'The worker searches for outlets with a verified editorial contact taken from the outlet\'s own site, then writes one release per outlet. Drafts appear a few at a time over the next several minutes at /dashboard/marketing/press-drafts.',
    '',
    'NOTHING HAS BEEN SENT and no editor has been contacted. Every draft waits for your approval. Outlets without a verifiable contact are skipped and named in the job rather than filled in with a guess.',
    args.capNote ? `\n${args.capNote}` : '',
    '',
    'Ask me "how is the press campaign going" at any time and I will read the job back to you.',
  ].filter(Boolean).join('\n')
}
