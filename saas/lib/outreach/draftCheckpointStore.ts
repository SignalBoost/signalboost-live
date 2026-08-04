// saas/lib/outreach/draftCheckpointStore.ts
//
// WHERE THE PREVIOUS DRAFT BODIES ARE KEPT WHILE A REFRESH RUNS.
//
// executeGuardedBulk refuses guarded mode without a checkpoint store, and refuses to attempt
// a chunk whose checkpoint could not be written. This is the store that satisfies it for the
// outreach draft refresh, and the operator-facing undo built on the same rows.
//
// WHY NOT AN IN-PROCESS ARRAY. Because the moment the values are needed is the moment the
// worker died. A checkpoint held in memory is a checkpoint that exists in every case except
// the one it was written for.
//
// WHAT THIS IS NOT. Restoring here is a COMPENSATING WRITE, not a rollback. If a person
// edited a draft between the capture and the write-back, putting the old body back overwrites
// their newer one — this system cannot see edits it did not make. Every function below
// reports which records it could not restore and why, because the ids are the deliverable
// when something breaks, not the summary line.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BulkRecordState } from '@/lib/portable/guarded-bulk-execution'

const CHECKPOINT_TABLE = 'outreach_draft_checkpoints'
const QUEUE_TABLE = 'outreach_queue'

/** The column the refresh rewrites. Named once so capture, apply and restore cannot drift. */
export const DRAFT_BODY_COLUMN = 'outreach_message'

export interface DraftCheckpointStore {
  put(key: string, value: BulkRecordState[]): Promise<void>
  get(key: string): Promise<BulkRecordState[] | undefined>
  delete(key: string): Promise<void>
}

function recordIdsOf(states: BulkRecordState[]): string[] {
  return states.map(state => String(state.recordId)).filter(Boolean)
}

/**
 * A checkpoint store scoped to one refresh run.
 *
 * `put` deliberately does NOT swallow its error. executeGuardedBulk treats a failed
 * checkpoint write as "do not attempt this chunk", and that decision is only correct if the
 * failure actually reaches it. A store that logged and continued would turn guarded mode
 * into standard mode wearing its name.
 *
 * `delete` is the opposite case and is intentionally forgiving: it runs on the happy path
 * after a chunk succeeded, and failing the whole run because a cleanup did not land would
 * discard good work over bookkeeping. Here it does not delete at all — see below.
 */
export function createDraftCheckpointStore(
  db: SupabaseClient,
  jobId: string,
): DraftCheckpointStore {
  return {
    async put(key: string, value: BulkRecordState[]): Promise<void> {
      const states = Array.isArray(value) ? value : []
      const { error } = await db.from(CHECKPOINT_TABLE).upsert(
        {
          checkpoint_key: key,
          job_id: jobId,
          record_ids: recordIdsOf(states),
          states,
        },
        { onConflict: 'checkpoint_key' },
      )
      if (error) throw new Error(`Checkpoint could not be written: ${error.message}`)
    },

    async get(key: string): Promise<BulkRecordState[] | undefined> {
      const { data, error } = await db
        .from(CHECKPOINT_TABLE)
        .select('states')
        .eq('checkpoint_key', key)
        .maybeSingle()
      if (error) throw new Error(`Checkpoint could not be read: ${error.message}`)
      const states = (data as { states?: unknown } | null)?.states
      return Array.isArray(states) ? (states as BulkRecordState[]) : undefined
    },

    /**
     * A NO-OP ON PURPOSE, AND THIS IS A REAL DECISION.
     *
     * The executor clears a checkpoint once its chunk has succeeded. Doing so would leave
     * a successful refresh with no record of what the drafts previously said — which is the
     * exact gap this whole change exists to close. "The rewrite worked" and "I want the old
     * copy back" are not mutually exclusive; a person reading the new draft is often how the
     * second one starts.
     *
     * The rows are therefore retained and pruned by the buyer's retention policy instead.
     */
    async delete(_key: string): Promise<void> {
      return
    },
  }
}

export interface DraftRestoreOutcome {
  recordId: string
  status: 'restored' | 'skipped' | 'failed'
  reason: string
}

export interface DraftRestoreReport {
  ok: boolean
  jobId: string | null
  checkpointsRead: number
  restored: string[]
  /** Records a person must look at. This is the list that matters when something breaks. */
  needsReconciliation: string[]
  outcomes: DraftRestoreOutcome[]
  summary: string
  error?: string
}

/**
 * Put previous draft bodies back, either for one checkpoint or for a whole run.
 *
 * Only rows still `pending` are rewritten. A draft that was approved or sent since the
 * refresh is a decision a person made about the NEW copy, and silently reverting it would
 * replace their judgement with ours. Those records are reported as needing reconciliation
 * with the reason stated, never quietly counted as restored.
 */
export async function restoreDraftCheckpoints(
  db: SupabaseClient,
  selector: { jobId?: string; checkpointKey?: string },
  detail = 'Operator-requested restore of pre-refresh draft bodies.',
): Promise<DraftRestoreReport> {
  const empty: DraftRestoreReport = {
    ok: false,
    jobId: selector.jobId ?? null,
    checkpointsRead: 0,
    restored: [],
    needsReconciliation: [],
    outcomes: [],
    summary: '',
  }

  if (!selector.jobId && !selector.checkpointKey) {
    return { ...empty, error: 'Nothing to restore: neither a job id nor a checkpoint key was given.' }
  }

  let query = db
    .from(CHECKPOINT_TABLE)
    .select('checkpoint_key,job_id,states,restored_at')
    .order('created_at', { ascending: true })
  if (selector.checkpointKey) query = query.eq('checkpoint_key', selector.checkpointKey)
  else if (selector.jobId) query = query.eq('job_id', selector.jobId)

  const { data, error } = await query
  if (error) return { ...empty, error: error.message }

  const checkpoints = (data || []) as Array<{
    checkpoint_key: string
    job_id: string
    states: unknown
    restored_at: string | null
  }>

  if (!checkpoints.length) {
    return {
      ...empty,
      ok: true,
      summary: 'No checkpoints matched, so nothing was written back and no drafts changed.',
    }
  }

  const outcomes: DraftRestoreOutcome[] = []
  const restored: string[] = []
  const needsReconciliation: string[] = []

  for (const checkpoint of checkpoints) {
    const states = Array.isArray(checkpoint.states) ? (checkpoint.states as BulkRecordState[]) : []

    for (const state of states) {
      const recordId = String(state?.recordId || '')
      if (!recordId) continue

      const previousBody = state?.fields?.[DRAFT_BODY_COLUMN]
      if (typeof previousBody !== 'string' || !previousBody.length) {
        needsReconciliation.push(recordId)
        outcomes.push({
          recordId,
          status: 'failed',
          reason: `The checkpoint holds no usable ${DRAFT_BODY_COLUMN} for this record, so nothing was written back.`,
        })
        continue
      }

      const { data: written, error: writeError } = await db
        .from(QUEUE_TABLE)
        .update({ [DRAFT_BODY_COLUMN]: previousBody })
        .eq('id', recordId)
        .eq('status', 'pending')
        .select('id')

      if (writeError) {
        needsReconciliation.push(recordId)
        outcomes.push({ recordId, status: 'failed', reason: writeError.message })
        continue
      }

      if (!written || !written.length) {
        // Not an error. The row left 'pending', which means a person acted on the new copy.
        outcomes.push({
          recordId,
          status: 'skipped',
          reason: 'This draft is no longer pending — someone approved, sent, rejected or archived it since the refresh, so their decision was left in place.',
        })
        continue
      }

      restored.push(recordId)
      outcomes.push({ recordId, status: 'restored', reason: 'Previous body written back.' })
    }

    await db
      .from(CHECKPOINT_TABLE)
      .update({ restored_at: new Date().toISOString(), restore_detail: detail })
      .eq('checkpoint_key', checkpoint.checkpoint_key)
  }

  const skipped = outcomes.filter(item => item.status === 'skipped').length
  const summary = [
    `${restored.length} draft${restored.length === 1 ? '' : 's'} written back`,
    skipped ? `${skipped} left alone because they are no longer pending` : '',
    needsReconciliation.length ? `${needsReconciliation.length} need a person: ${needsReconciliation.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ')

  return {
    ok: needsReconciliation.length === 0,
    jobId: selector.jobId ?? checkpoints[0]?.job_id ?? null,
    checkpointsRead: checkpoints.length,
    restored,
    needsReconciliation,
    outcomes,
    summary: `${summary}.`,
  }
}

export interface DraftCheckpointSummary {
  checkpointKey: string
  jobId: string
  createdAt: string
  recordIds: string[]
  restoredAt: string | null
}

/** What can still be undone, newest first. Feeds the console's undo affordance. */
export async function listDraftCheckpoints(
  db: SupabaseClient,
  options: { jobId?: string; recordId?: string; limit?: number } = {},
): Promise<{ ok: boolean; checkpoints: DraftCheckpointSummary[]; error?: string }> {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100))

  let query = db
    .from(CHECKPOINT_TABLE)
    .select('checkpoint_key,job_id,created_at,record_ids,restored_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (options.jobId) query = query.eq('job_id', options.jobId)
  if (options.recordId) query = query.contains('record_ids', [options.recordId])

  const { data, error } = await query
  if (error) return { ok: false, checkpoints: [], error: error.message }

  const checkpoints = (data || []).map((row: any) => ({
    checkpointKey: String(row.checkpoint_key),
    jobId: String(row.job_id),
    createdAt: String(row.created_at),
    recordIds: Array.isArray(row.record_ids) ? row.record_ids.map(String) : [],
    restoredAt: row.restored_at ? String(row.restored_at) : null,
  }))

  return { ok: true, checkpoints }
}
