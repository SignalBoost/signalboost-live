// saas/lib/outreach/refreshDrafts.ts
//
// REWRITE PENDING DRAFTS WITH THE CURRENT PRODUCT FACTS — WITHOUT LOSING THE RECIPIENTS.
//
// About a hundred drafts were written before the manifests were corrected. They describe
// the Supervisor as monitoring software, omit that it repairs anything, and say nothing
// about the execution channels or the transactional boundary. Approving them would send
// the weakest version of the pitch to a hundred companies, each of which can only be
// approached once for this product.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY REWRITE RATHER THAN DELETE AND RE-RUN
//
// Deleting is SAFE — verified, not assumed. getRecipientHistory only reports `contacted`
// when a row exists in outreach_sends, so an unsent queue row blocks nothing and those
// companies could be approached again. But safe is not the same as free: the expensive
// part of a campaign is not the writing, it is the DISCOVERY — finding the company,
// finding a published address, and clearing the role-box and listicle filters. Deleting
// throws that away and pays for it twice, and a second discovery pass would not
// necessarily return the same hundred companies.
//
// So this rewrites the BODY and leaves the recipient, the address, the product key and
// the row id exactly where they are.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IT WILL NOT DO
//
//   · Touch anything but a 'pending' row. Sent, approved, archived and rejected rows are
//     historical records; rewriting one would falsify what was actually sent.
//   · Guess a product. A row whose product_key matches no manifest is skipped and
//     reported, never rewritten against a product it might not be selling.
//   · Discard the old body. It is returned in the report before the write, so a bad
//     refresh can be reasoned about rather than mourned.
//   · Write anything at all in dryRun mode, which is the default.
//
// ─────────────────────────────────────────────────────────────────────────────
// GUARDED MODE — THE TRANSACTIONAL BOUNDARY, ADDED AUG 2026
//
// Everything above describes a system that could explain a bad refresh and not undo one.
// The previous bodies existed only inside the HTTP response, so once the tab closed the
// old copy was gone. That is the gap guarded mode closes: previous bodies are captured to
// a checkpoint store BEFORE anything is written, in chunks, and a chunk that fails is
// written back.
//
// GENERATE FIRST, THEN WRITE. The model calls now happen in a phase of their own and touch
// nothing. Only rows that produced a usable new body enter the write phase. This matters
// for more than tidiness: a chunk in guarded mode must be able to fail as a unit, and a
// chunk containing rows that were never going to be written cannot.
//
// THE HONEST NAME FOR THE RECOVERY IS COMPENSATING, NOT ATOMIC. Writing a previous value
// back is not time travel — if a person edited a draft between capture and write-back,
// restoring the old body overwrites their newer one, and this system cannot see edits it
// did not make. What guarded mode buys is a BOUNDED BLAST RADIUS and the exact ids. Do not
// let any surface downstream upgrade that into "fully reversible".

import { createClient } from '@supabase/supabase-js'
import { manifestsForOffer } from '@/lib/portable-products/matchManifests'
import { productKeyOf } from '@/lib/outreach/recipientHistory'
import { draftMessageFor } from '@/lib/outreach/prospectCampaign'
import { finishOutreachBody } from '@/lib/ai/growthPlans'
import {
  executeGuardedBulk,
  type BulkExecutionMode,
  type BulkRecordState,
} from '@/lib/portable/guarded-bulk-execution'
import { resolveGuardMode, type GuardModeSettingReader } from '@/lib/portable/guard-mode'
import { createDraftCheckpointStore, DRAFT_BODY_COLUMN } from '@/lib/outreach/draftCheckpointStore'

const TABLE = 'outreach_queue'

export interface RefreshOutcome {
  outreachId: string
  businessName: string
  contactEmail: string
  status: 'refreshed' | 'skipped' | 'failed'
  reason: string
  productKey: string | null
  previousMessage?: string
  newMessage?: string
}

export interface RefreshReport {
  ok: boolean
  dryRun: boolean
  /** Pending rows still awaiting a rewrite after this pass. The caller loops until zero. */
  remaining: number
  examined: number
  refreshed: number
  skipped: number
  failed: number
  outcomes: RefreshOutcome[]
  error?: string

  // ── Guarded-mode reporting. Optional so existing callers are unaffected. ──
  /** Which mode this pass actually ran in, and why. Present whenever a write was attempted. */
  mode?: BulkExecutionMode
  modeReason?: string
  /** 'compensating' in guarded mode, 'none' in standard. Never 'atomic'. */
  reversibility?: 'compensating' | 'none'
  /** Groups the checkpoints of this run, so the whole run can be written back by one id. */
  checkpointJobId?: string
  /** Drafts changed and then written back after their chunk failed. */
  rolledBackRecordIds?: string[]
  /** Drafts a person must look at. This is the list that matters when something breaks. */
  needsReconciliationRecordIds?: string[]
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

// Matching lives in lib/portable-products/matchManifests so the campaign worker and this
// refresh agree on what an offer refers to. The first version compared slugs exactly and
// therefore skipped EVERY row in a real queue: those campaigns sell two products, so the
// product_key was a combined slug matching no single manifest. An unmatched key still
// means skip — a campaign selling something the manifests do not describe gets no rewrite
// rather than a rewrite against the closest-looking product.

// ONE ROW IS ONE MODEL CALL, AND THAT IS THE WHOLE DESIGN CONSTRAINT.
//
// The first version took a limit of 100 and worked through it one row at a time. A
// hundred sequential model calls is fifteen minutes of work inside a function that gets
// a few, so the platform killed it and returned a plain-text error page — which the
// browser then tried to parse as JSON, producing "Unexpected token 'A'". Nothing had
// been written, and nothing said so.
//
// So the work is bounded twice: rows run in CONCURRENT batches, and the pass stops on a
// TIME BUDGET well inside the function's own ceiling, reporting what is left. The caller
// loops. A refresh of any size now completes as a series of small, honest passes rather
// than one request that dies at the end.
const CONCURRENCY = 6
const TIME_BUDGET_MS = 45_000

// A CHUNK IS THE BLAST RADIUS, SO IT IS SIZED FOR THIS OPERATION AND NOT FOR THE MODULE.
//
// guarded-bulk-execution defaults to 250 because most bulk work is cheap field updates. A
// page here is at most 60 rows and each one cost a model call, so 250 would make the whole
// page a single chunk and the sentence a buyer hears would be "at most 60 drafts affected".
// Six keeps it to "at most six", matches the generation concurrency, and costs nothing:
// the writes are fast, the expensive phase already happened.
const GUARDED_CHUNK = 6

interface PreparedRow {
  base: Pick<RefreshOutcome, 'outreachId' | 'businessName' | 'contactEmail' | 'productKey'>
  previousMessage: string
  newMessage: string
  manifestLabel: string
}

export async function refreshPendingDrafts(options: {
  dryRun?: boolean
  limit?: number
  productKey?: string | null
  /**
   * How many pending rows to skip. A rewritten row STAYS pending — that is the point, it
   * still needs approving — so progress cannot be measured by status. The caller pages
   * with an offset over a stable oldest-first ordering instead, which also means a row
   * that failed twice is not retried forever ahead of rows never attempted.
   */
  offset?: number
  /**
   * Force a mode for this run. Omit to use the buyer's saved setting, which itself
   * defaults to 'standard' — guarded execution is opt-in, never imposed.
   */
  mode?: BulkExecutionMode | null
  /** The buyer's saved guard-mode setting, injected. Omit and the default applies. */
  guardModeSettings?: GuardModeSettingReader
  /** Groups this run's checkpoints. Generated when not supplied. */
  jobId?: string
} = {}): Promise<RefreshReport> {
  const startedAt = Date.now()
  const remainingMs = () => TIME_BUDGET_MS - (Date.now() - startedAt)
  const dryRun = options.dryRun !== false
  const limit = Math.max(1, Math.min(options.limit ?? 24, 60))
  const offset = Math.max(0, options.offset ?? 0)
  const empty: RefreshReport = { ok: false, dryRun, remaining: 0, examined: 0, refreshed: 0, skipped: 0, failed: 0, outcomes: [] }

  const db = admin()
  if (!db) return { ...empty, error: 'Supabase service credentials are not configured.' }

  let query = db.from(TABLE)
    .select('id,business_name,business_url,contact_email,product_key,sender_key,outreach_message')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1)
  if (options.productKey) query = query.eq('product_key', productKeyOf(options.productKey))

  const { data: rows, error } = await query
  if (error) return { ...empty, error: error.message }

  const outcomes: RefreshOutcome[] = []
  const prepared: PreparedRow[] = []

  // ── PHASE ONE: generate. Nothing here writes to outreach_queue. ──
  async function prepareRow(row: any): Promise<void> {
    const base = {
      outreachId: row.id as string,
      businessName: String(row.business_name || ''),
      contactEmail: String(row.contact_email || ''),
      productKey: (row.product_key as string) || null,
    }

    // THE KEY IS NOT THE ONLY EVIDENCE OF WHAT THIS DRAFT SELLS.
    //
    // product_key is a slug of whatever offer text a person typed months ago, and a
    // refresh that depends on it alone fails silently whenever that text did not name the
    // products the way the manifests do — which is exactly what happened on a real queue:
    // the drafts were regenerated, the wording changed, and the pitch stayed identical
    // because no fact sheet ever reached the prompt.
    //
    // The EXISTING MESSAGE names the products in plain language — "a Self-Healing
    // Supervisor", "a Marketing and Sales Engine" — because an earlier draft wrote them
    // out. So both are read and the results unioned: the key when it works, the message
    // when it does not. A draft that names a product IS evidence of what the campaign
    // sells, and ignoring it to honour a slug was the wrong kind of strictness.
    const fromKey = manifestsForOffer(row.product_key)
    const fromMessage = manifestsForOffer(String(row.outreach_message || '').slice(0, 4000))
    const manifests = [...fromKey]
    for (const candidate of fromMessage) {
      if (!manifests.some(item => item.productId === candidate.productId)) manifests.push(candidate)
    }

    if (!manifests.length) {
      outcomes.push({ ...base, status: 'skipped', reason: `Nothing identifies a product for this row — product_key is "${row.product_key || '(none)'}" and the existing message names no known product.` })
      return
    }
    if (!row.business_url) {
      outcomes.push({ ...base, status: 'skipped', reason: 'Row has no business_url, so the message cannot be localized to the recipient.' })
      return
    }

    try {
      // A synthetic job carrying the SAME fields the campaign worker passes. The offer is
      // the manifest displayName, which is exactly what offerProfileFor matches on, so the
      // full fact sheet — category, capabilities, execution modes, exclusions — reaches
      // the prompt. targetAudience stands in for the original brief's targeting line: the
      // brief is not stored on the row, and the manifest's own audience is a truthful
      // substitute rather than an invented one.
      // Every product this row sells, so a two-product campaign is rewritten as a
      // two-product email rather than losing one of them.
      const audience = Array.from(new Set(manifests.flatMap(item => item.targetAudience)))
      const job: any = {
        offer: manifests.map(item => item.displayName).join(' and '),
        target_criteria: audience.length
          ? audience.map(entry => entry.replace(/[-_]/g, ' ')).join(', ')
          : 'companies that would benefit from this product',
        language: 'en',
        region: '',
        requested_count: 1,
      }
      const candidate: any = { name: base.businessName, url: String(row.business_url), snippet: '' }

      const drafted = await draftMessageFor(job, candidate)
      if (!drafted || drafted.length < 40) {
        outcomes.push({ ...base, status: 'failed', reason: 'The regenerated message came back empty or too short; the existing draft was left untouched.' })
        return
      }

      const finished = await finishOutreachBody({
        message: drafted,
        businessUrl: String(row.business_url),
        businessName: base.businessName,
        senderKey: (row.sender_key as string) || 'saasSales',
      })

      prepared.push({
        base,
        previousMessage: String(row.outreach_message || ''),
        newMessage: finished,
        manifestLabel: manifests.map(item => item.displayName).join(' + '),
      })
    } catch (err: any) {
      outcomes.push({ ...base, status: 'failed', reason: String(err?.message || err || 'Unknown error while regenerating.') })
    }
  }

  // Concurrent batches, stopped by the time budget rather than by the platform.
  const queue = [...(rows || [])]
  while (queue.length && remainingMs() > 8_000) {
    const batch = queue.splice(0, CONCURRENCY)
    // prepareRow never throws — a failed row is recorded as an outcome, so one bad row
    // cannot discard the work of the five running beside it.
    await Promise.all(batch.map(row => prepareRow(row)))
  }

  const reached = outcomes.length + prepared.length

  const finish = (extra: Partial<RefreshReport> = {}): RefreshReport => ({
    ok: true,
    dryRun,
    remaining: 0,
    examined: outcomes.length,
    refreshed: outcomes.filter(item => item.status === 'refreshed').length,
    skipped: outcomes.filter(item => item.status === 'skipped').length,
    failed: outcomes.filter(item => item.status === 'failed').length,
    outcomes,
    ...extra,
  })

  const countRemaining = async () => {
    const { count: totalPending } = await db.from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    // Rows this pass did not get to (time budget) plus everything past this page.
    return Math.max(0, (totalPending || 0) - (offset + reached))
  }

  // ── DRY RUN: report what would have been written, write nothing. ──
  if (dryRun) {
    for (const item of prepared) {
      outcomes.push({
        ...item.base,
        status: 'refreshed',
        reason: `Dry run using: ${item.manifestLabel}. Nothing was written.`,
        previousMessage: item.previousMessage,
        newMessage: item.newMessage,
      })
    }
    return finish({ remaining: await countRemaining(), mode: 'standard', reversibility: 'none' })
  }

  // ── PHASE TWO: write, under whichever boundary the buyer asked for. ──
  const jobId = options.jobId || `draft-refresh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const checkpointStore = createDraftCheckpointStore(db, jobId)

  const resolution = await resolveGuardMode({
    hasCheckpointStore: true,
    scope: { operation: 'draft-refresh' },
    settingReader: options.guardModeSettings,
    runOverride: options.mode ?? null,
  })

  if (resolution.refused) {
    // Nothing was written. Every prepared row is reported so the operator sees the cost of
    // the refusal, not just the refusal.
    for (const item of prepared) {
      outcomes.push({ ...item.base, status: 'skipped', reason: resolution.reason })
    }
    return { ...finish({ remaining: await countRemaining(), mode: resolution.mode, modeReason: resolution.reason }), ok: false, error: resolution.reason }
  }

  // Re-asserting status='pending' on every write is deliberate: if a person approved a row
  // while the refresh was running, the update finds nothing and their approved copy
  // survives. It is not treated as a failure — nobody did anything wrong.
  const writeBody = async (recordId: string, body: string): Promise<string | null> => {
    const { error: writeError } = await db.from(TABLE)
      .update({ [DRAFT_BODY_COLUMN]: body })
      .eq('id', recordId)
      .eq('status', 'pending')
    return writeError ? writeError.message : null
  }

  if (resolution.mode === 'standard') {
    for (const item of prepared) {
      const failure = await writeBody(item.base.outreachId, item.newMessage)
      if (failure) {
        outcomes.push({ ...item.base, status: 'failed', reason: failure })
        continue
      }
      outcomes.push({
        ...item.base,
        status: 'refreshed',
        // Standard mode's own failure wording says plainly that nothing was checkpointed.
        reason: `Rewritten using: ${item.manifestLabel}. No checkpoint was taken, so this rewrite cannot be undone by this system.`,
        previousMessage: item.previousMessage,
        newMessage: item.newMessage,
      })
    }
    return finish({
      remaining: await countRemaining(),
      mode: 'standard',
      modeReason: resolution.reason,
      reversibility: 'none',
    })
  }

  // ── GUARDED ──
  const records: BulkRecordState[] = prepared.map(item => ({
    recordId: item.base.outreachId,
    fields: { [DRAFT_BODY_COLUMN]: item.newMessage },
  }))

  const result = await executeGuardedBulk({
    mode: 'guarded',
    records,
    chunkSize: GUARDED_CHUNK,
    jobId,
    checkpointStore,

    // Read the CURRENT body from the database rather than reusing the one fetched at the
    // top of this pass. Minutes of model calls happened in between, and the value worth
    // keeping is the one that exists immediately before the write.
    async captureState(recordIds) {
      const { data, error: readError } = await db.from(TABLE)
        .select(`id,${DRAFT_BODY_COLUMN}`)
        .in('id', [...recordIds])
      if (readError) throw new Error(`Previous drafts could not be read for checkpointing: ${readError.message}`)
      return (data || []).map((row: any) => ({
        recordId: String(row.id),
        fields: { [DRAFT_BODY_COLUMN]: String(row[DRAFT_BODY_COLUMN] ?? '') },
      }))
    },

    async applyChange(chunk) {
      const failedRecordIds: string[] = []
      const details: string[] = []
      for (const record of chunk) {
        const body = record.fields?.[DRAFT_BODY_COLUMN]
        const failure = await writeBody(record.recordId, typeof body === 'string' ? body : '')
        if (failure) {
          failedRecordIds.push(record.recordId)
          details.push(`${record.recordId}: ${failure}`)
        }
      }
      return { failedRecordIds, detail: details.join('; ') }
    },

    async restoreState(chunk) {
      const failedRecordIds: string[] = []
      const details: string[] = []
      for (const record of chunk) {
        const body = record.fields?.[DRAFT_BODY_COLUMN]
        const failure = await writeBody(record.recordId, typeof body === 'string' ? body : '')
        if (failure) {
          failedRecordIds.push(record.recordId)
          details.push(`${record.recordId}: ${failure}`)
        }
      }
      return { failedRecordIds, detail: details.join('; ') }
    },
  })

  const applied = new Set(result.appliedRecordIds)
  const rolledBack = new Set(result.rolledBackRecordIds)
  const needsPerson = new Set(result.needsReconciliationRecordIds)

  for (const item of prepared) {
    const id = item.base.outreachId
    if (needsPerson.has(id)) {
      outcomes.push({ ...item.base, status: 'failed', reason: `This draft needs a person: its chunk failed and the previous body could not be written back. ${result.summary}` })
      continue
    }
    if (rolledBack.has(id)) {
      outcomes.push({ ...item.base, status: 'skipped', reason: `Rewritten and then written back because its chunk failed. It should hold its previous body. ${result.summary}` })
      continue
    }
    if (applied.has(id)) {
      outcomes.push({
        ...item.base,
        status: 'refreshed',
        reason: `Rewritten using: ${item.manifestLabel}. Previous body checkpointed under job ${jobId}.`,
        previousMessage: item.previousMessage,
        newMessage: item.newMessage,
      })
      continue
    }
    outcomes.push({ ...item.base, status: 'skipped', reason: `Not attempted — the run halted before this chunk. ${result.summary}` })
  }

  return finish({
    remaining: await countRemaining(),
    ok: result.status !== 'failed',
    mode: 'guarded',
    modeReason: resolution.reason,
    reversibility: result.reversibility,
    checkpointJobId: jobId,
    rolledBackRecordIds: result.rolledBackRecordIds,
    needsReconciliationRecordIds: result.needsReconciliationRecordIds,
  })
}
