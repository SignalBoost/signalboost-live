// saas/lib/portable/guarded-bulk-execution.ts
//
// TWO MODES FOR BULK WORK, AND THE BUYER CHOOSES.
//
// A marketing team updating five thousand leads wants it done. A bank's risk committee
// wants to know what happens when it goes wrong halfway through. Those are not the same
// customer, and forcing one architecture on both loses one of them.
//
//   STANDARD  — one pass, full speed, protected by the approval gates and spend caps that
//               already exist. What most buyers want and what they are already used to.
//
//   GUARDED   — the same work split into small chunks, each with its own checkpoint
//               written to the BUYER's own store before it runs. A chunk that fails is
//               written back immediately and the run STOPS. What a bank asks for.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT GUARDED MODE ACTUALLY GUARANTEES, STATED PRECISELY
//
// It does NOT make bulk CRM work transactionally reversible, and any document claiming it
// does will be wrong in a way a technical buyer can prove in one question. Writing a
// captured value back is a COMPENSATING ACTION: if a salesperson edited that lead between
// the capture and the write-back, restoring the old value overwrites their newer one. No
// amount of batching changes that — the platform cannot see edits it did not make.
//
// What batching genuinely buys is BLAST RADIUS. In standard mode a failure at record 4,300
// leaves four thousand three hundred changed records and no list of which. In guarded mode
// the failure is confined to one chunk, that chunk is written back at once, the run halts
// before touching the next, and the operator gets the exact record ids that need a human.
//
// "If something goes wrong, at most N records are affected and you get their ids" is a
// sentence that survives a security review. "100% reversible" is not.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A FAILED CHUNK STOPS THE RUN
//
// The instinct is to skip the bad chunk and carry on — most of the work would still get
// done. That instinct is wrong here. A chunk failing usually means something systemic:
// the API is rate limiting, a credential expired, a required field changed. Continuing
// means discovering the same failure another nine times while making nine more chunks of
// mess. Stopping at the first one is what keeps the blast radius equal to the chunk size
// rather than to the whole job.

export const guardedBulkSchemaVersion = 'guarded-bulk-execution-v1'

/** Above this, a "chunk" is no longer a bounded blast radius. */
export const GUARDED_CHUNK_CEILING = 1000
export const GUARDED_DEFAULT_CHUNK = 250

export type BulkExecutionMode = 'standard' | 'guarded'

export interface BulkRecordState {
  recordId: string
  fields: Record<string, string | number | boolean | null>
}

export interface GuardedBulkChunkReport {
  index: number
  recordIds: string[]
  outcome: 'applied' | 'rolled_back' | 'not_attempted' | 'needs_reconciliation'
  detail: string
}

export interface GuardedBulkResult {
  mode: BulkExecutionMode
  status: 'completed' | 'halted' | 'failed'
  /**
   * Deliberately not 'atomic'. In guarded mode recovery is a compensating write-back, and
   * naming it honestly here is what stops a downstream document calling it a rollback.
   */
  reversibility: 'compensating' | 'none'
  totalRecords: number
  appliedRecordIds: string[]
  /** Records changed and then written back. They should hold their original values. */
  rolledBackRecordIds: string[]
  /** Records a person must look at. This is the list that matters when something breaks. */
  needsReconciliationRecordIds: string[]
  notAttemptedRecordIds: string[]
  chunks: GuardedBulkChunkReport[]
  summary: string
  schemaVersion: string
}

export interface GuardedBulkOptions {
  mode: BulkExecutionMode
  records: readonly BulkRecordState[]
  /** Read current values for these records, before changing them. Guarded mode only. */
  captureState(recordIds: readonly string[]): Promise<BulkRecordState[]> | BulkRecordState[]
  /** Apply the intended change. Returns the ids that did NOT succeed. */
  applyChange(records: readonly BulkRecordState[]): Promise<{ failedRecordIds: string[]; detail?: string }> | { failedRecordIds: string[]; detail?: string }
  /** Write captured values back. Returns the ids that could NOT be restored. */
  restoreState(records: readonly BulkRecordState[]): Promise<{ failedRecordIds: string[]; detail?: string }> | { failedRecordIds: string[]; detail?: string }
  /**
   * Where the pre-change values are kept — the buyer's database, object store or vault.
   * Required in guarded mode: an in-process array would lose the only copy of the previous
   * values the moment the worker restarts, which is precisely when they are needed.
   */
  checkpointStore?: {
    put(key: string, value: BulkRecordState[]): Promise<void> | void
    get(key: string): Promise<BulkRecordState[] | undefined> | BulkRecordState[] | undefined
    delete?(key: string): Promise<void> | void
  }
  chunkSize?: number
  jobId?: string
}

export async function executeGuardedBulk(options: GuardedBulkOptions): Promise<GuardedBulkResult> {
  const records = [...(options.records || [])]
  const chunks: GuardedBulkChunkReport[] = []
  const applied: string[] = []
  const rolledBack: string[] = []
  const needsReconciliation: string[] = []
  const jobId = options.jobId || `bulk_${Date.now().toString(36)}`

  const base = (status: GuardedBulkResult['status'], reversibility: GuardedBulkResult['reversibility'], summary: string, notAttempted: string[]): GuardedBulkResult => ({
    mode: options.mode,
    status,
    reversibility,
    totalRecords: records.length,
    appliedRecordIds: applied,
    rolledBackRecordIds: rolledBack,
    needsReconciliationRecordIds: needsReconciliation,
    notAttemptedRecordIds: notAttempted,
    chunks,
    summary,
    schemaVersion: guardedBulkSchemaVersion,
  })

  if (!records.length) return base('completed', 'none', 'Nothing to do.', [])

  // ── STANDARD MODE ────────────────────────────────────────────────────────
  // One pass. No checkpoint is taken, so none is claimed: on failure the result says
  // plainly that the changed records cannot be identified, because they cannot.
  if (options.mode !== 'guarded') {
    const outcome = await options.applyChange(records)
    const failed = new Set(outcome.failedRecordIds || [])
    for (const record of records) (failed.has(record.recordId) ? needsReconciliation : applied).push(record.recordId)
    chunks.push({ index: 0, recordIds: records.map(r => r.recordId), outcome: failed.size ? 'needs_reconciliation' : 'applied', detail: outcome.detail || '' })
    return failed.size
      ? base('failed', 'none', `${applied.length} of ${records.length} records updated; ${failed.size} failed. No checkpoint was taken in standard mode, so the failed records are listed but the successful changes cannot be undone.`, [])
      : base('completed', 'none', `${records.length} records updated.`, [])
  }

  // ── GUARDED MODE ─────────────────────────────────────────────────────────
  if (!options.checkpointStore) {
    // Refused rather than silently downgraded to standard. A caller that asked for guarded
    // mode is making a promise to someone; running without checkpoints would keep the
    // promise's wording and drop its meaning.
    return base('failed', 'none', 'Guarded mode requires a checkpoint store to hold the pre-change values. Nothing was attempted.', records.map(r => r.recordId))
  }

  const chunkSize = Math.max(1, Math.min(options.chunkSize ?? GUARDED_DEFAULT_CHUNK, GUARDED_CHUNK_CEILING))
  const batches: BulkRecordState[][] = []
  for (let index = 0; index < records.length; index += chunkSize) batches.push(records.slice(index, index + chunkSize))

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index]
    const ids = batch.map(record => record.recordId)
    const remaining = () => batches.slice(index + 1).flat().map(record => record.recordId)

    // 1. Capture, and store where the buyer keeps it.
    let before: BulkRecordState[]
    try {
      before = await options.captureState(ids)
      if (!before.length) throw new Error('capture returned nothing')
      await options.checkpointStore.put(`${jobId}:${index}`, before)
    } catch (error) {
      chunks.push({ index, recordIds: ids, outcome: 'not_attempted', detail: `Checkpoint failed: ${error instanceof Error ? error.message : String(error)}` })
      // Not attempted, not failed. Refusing to change records we could not checkpoint is
      // the whole point of the mode.
      return base('halted', 'compensating', `Stopped before chunk ${index + 1} of ${batches.length}: the checkpoint could not be written, so those records were left untouched. ${applied.length} records were updated in earlier chunks and remain changed.`, [...ids, ...remaining()])
    }

    // 2. Apply.
    const outcome = await options.applyChange(batch)
    const failed = new Set(outcome.failedRecordIds || [])

    if (!failed.size) {
      applied.push(...ids)
      chunks.push({ index, recordIds: ids, outcome: 'applied', detail: outcome.detail || '' })
      continue
    }

    // 3. This chunk failed — write it back, then STOP.
    const restore = await options.restoreState(before)
    const unrestored = new Set(restore.failedRecordIds || [])
    for (const id of ids) (unrestored.has(id) ? needsReconciliation : rolledBack).push(id)
    chunks.push({
      index,
      recordIds: ids,
      outcome: unrestored.size ? 'needs_reconciliation' : 'rolled_back',
      detail: `${failed.size} record(s) failed to update. ${outcome.detail || ''} ${unrestored.size ? `${unrestored.size} could not be written back: ${restore.detail || ''}` : 'The chunk was written back to its captured values.'}`.trim(),
    })

    const stillRemaining = remaining()
    for (const later of batches.slice(index + 1)) {
      chunks.push({ index: chunks.length, recordIds: later.map(r => r.recordId), outcome: 'not_attempted', detail: 'Run halted after an earlier chunk failed.' })
    }

    const summary = unrestored.size
      ? `Chunk ${index + 1} of ${batches.length} failed and ${unrestored.size} of its ${ids.length} records could not be written back. Those ids need a person. The run stopped: ${stillRemaining.length} records were never touched.`
      : `Chunk ${index + 1} of ${batches.length} failed and was written back to its captured values. The run stopped: ${stillRemaining.length} records were never touched, and ${applied.length} from earlier chunks remain changed.`
    return base('halted', 'compensating', summary, stillRemaining)
  }

  return base('completed', 'compensating', `${records.length} records updated in ${batches.length} chunk(s) of up to ${chunkSize}, each checkpointed before it ran.`, [])
}

/**
 * The claim this mode supports, for anyone writing buyer-facing copy — deliberately
 * exported so a document does not have to invent its own wording and drift.
 *
 * It says blast radius, not reversibility, because that is what is true.
 */
export function guardedBulkClaim(chunkSize: number = GUARDED_DEFAULT_CHUNK): string {
  return `Bulk changes run in checkpointed batches of ${chunkSize}. If a batch fails it is written back to its captured values and the run stops, so at most ${chunkSize} records are ever affected by a failure — and you get their ids.`
}
