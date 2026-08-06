// saas/lib/supervisor/assessment-ledger.ts
//
// THE WRITER AND READER FOR THE ASSESSMENT LEDGER.
//
// Three properties this file exists to guarantee, none of which belongs in a page:
//
//   APPEND-ONLY. There is an insert and there are reads. No update, no delete, not even a
//   private one. An assessment that can be edited after the fact is not evidence, and the
//   product's whole claim rests on that distinction.
//
//   ONE ROW PER CHANGE, NOT PER PAGE VIEW. `recordAssessmentIfChanged` compares the incoming
//   fingerprint with the newest stored row and skips an identical one. Without that, opening
//   the console twice would write two rows and the ledger would record traffic instead of
//   history — and "when did this change?" would become unanswerable inside the audit trail
//   built to answer it.
//
//   NEVER THROWS. Same rule as observation-policy: a supervisor that stops supervising
//   because it could not write its own audit record has failed at the more important job.
//   Every function returns a result that says what happened, and the console reports the
//   ledger as unavailable rather than pretending an assessment was stored.
//
// A NOTE ON WHERE THIS IS CALLED FROM. Today the console writes on render, deduplicated by
// fingerprint, which is why opening the page ten times produces one row. The better home is
// the observation cron — an assessment per observation, written whether or not anyone is
// looking. That move is small once the cron composes the assessment itself; until then, an
// unobserved change between page views is not recorded, and that limitation is real and worth
// stating rather than papering over.

import type { AssessmentRecord, StoredAssessment } from './assessment-record.ts'

type AnyClient = { from: (table: string) => any }

const TABLE = 'supervisor_assessment_ledger'

export type LedgerWriteResult = {
  recorded: boolean
  /** Why not, when it was not. Never empty on a skip. */
  reason: string
  /** True when storage itself was unavailable, as opposed to a deliberate skip. */
  unavailable: boolean
}

export type LedgerReadResult = {
  records: StoredAssessment[]
  /** False when the ledger could not be read at all — different from "no history yet". */
  available: boolean
}

function toStored(row: any): StoredAssessment {
  return {
    recordedAt: String(row.recorded_at),
    operationalState: String(row.operational_state),
    impactAffected: row.impact_affected === true,
    confidence: Number(row.confidence) || 0,
    pageOnCall: row.page_on_call === true,
    contradictions: Number(row.contradictions) || 0,
    inputDigest: String(row.input_digest || ''),
    moduleVersion: String(row.module_version || ''),
  }
}

/**
 * The most recent conclusions, newest first.
 *
 * `available: false` means the read failed and the console must say so. It is NOT the same as
 * an empty ledger, which is a perfectly good state on the first run and should read as "no
 * history yet" rather than as a fault.
 */
export async function listAssessments(db: AnyClient, environment = 'production', limit = 50): Promise<LedgerReadResult> {
  try {
    const { data, error } = await db
      .from(TABLE)
      .select('recorded_at, operational_state, impact_affected, confidence, page_on_call, contradictions, input_digest, module_version')
      .eq('environment', environment)
      .order('recorded_at', { ascending: false })
      .limit(limit)
    if (error) return { records: [], available: false }
    return { records: (data ?? []).map(toStored), available: true }
  } catch {
    return { records: [], available: false }
  }
}

/**
 * Write one conclusion, unconditionally.
 *
 * Used when the caller has already decided this row belongs — a replay import, a test, a cron
 * that wants a heartbeat row per observation regardless of whether anything moved.
 */
export async function recordAssessment(db: AnyClient, record: AssessmentRecord): Promise<LedgerWriteResult> {
  try {
    const { error } = await db.from(TABLE).insert({
      environment: record.environment,
      operational_state: record.operationalState,
      impact_affected: record.impactAffected,
      confidence: record.confidence,
      page_on_call: record.pageOnCall,
      contradictions: record.contradictions,
      assessment: record.assessment,
      inputs: record.inputs,
      input_digest: record.inputDigest,
      module_version: record.moduleVersion,
    })
    if (error) return { recorded: false, reason: 'The ledger rejected the write.', unavailable: true }
    return { recorded: true, reason: '', unavailable: false }
  } catch {
    return { recorded: false, reason: 'The ledger could not be reached.', unavailable: true }
  }
}

/**
 * Write only when the evidence has actually changed.
 *
 * The comparison is against the NEWEST row alone, deliberately, not against the whole table.
 * A state that returns to a previous value is a real event and deserves its own row — the
 * question the ledger answers is "when did this change", and collapsing a return to an
 * earlier condition would erase exactly that.
 *
 * A change of module version also forces a row even when the inputs are identical: the same
 * evidence read by different reasoning is a different conclusion, and that is the moment a
 * reviewer most wants recorded.
 */
export async function recordAssessmentIfChanged(db: AnyClient, record: AssessmentRecord): Promise<LedgerWriteResult> {
  const latest = await listAssessments(db, record.environment, 1)
  if (!latest.available) {
    return { recorded: false, reason: 'The ledger could not be read, so nothing was written.', unavailable: true }
  }
  const newest = latest.records[0]
  if (newest && newest.inputDigest === record.inputDigest && newest.moduleVersion === record.moduleVersion) {
    return { recorded: false, reason: 'Identical to the newest stored assessment. The ledger records changes, not page views.', unavailable: false }
  }
  return recordAssessment(db, record)
}
