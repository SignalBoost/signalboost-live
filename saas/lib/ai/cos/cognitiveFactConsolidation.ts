// saas/lib/ai/cos/cognitiveFactConsolidation.ts
//
// Item 3 (long-term memory quality) at the FACT level. Skills already have staleness/weakening
// (cognitiveConsolidation.ts) and quarantine-on-contradiction (cognitiveLearningLifecycle.ts).
// cos_knowledge_facts had none of that: upsertFact() silently overwrote the object on any
// (task_id,subject,predicate) collision, with zero audit trail and no revalidation cycle.
//
// The decision logic here is pure and DB-free, same split as cognitiveHeldOutCertification.ts —
// testable without Supabase. The DB-backed functions at the bottom are thin callers.
//
// Design choice: a fact is never silently deleted or silently overwritten. A contradiction always
// keeps the higher-confidence claim and always logs the loser to cos_knowledge_fact_revisions;
// staleness decays confidence rather than deleting outright, so a fact fades before it disappears;
// pruning only removes what staleness has already decayed below the floor. Same shape as the skill
// lifecycle: weaken before quarantine, never an instant drop from strong to gone.

import type { KnowledgeFact } from '@/lib/cos-core/layers/knowledge/persistent'
// cosServiceDb is imported lazily inside the DB-backed functions below, not here at module scope.
// `node --test` cannot resolve the `@/` alias, so a top-level value-import of it makes this whole
// file unloadable in plain node tests (this bit tests/cosUserFeedbackLearning already, pre-existing
// on main). Keeping the pure decision logic above free of `@/` imports is what keeps it testable.

export const FACT_STALENESS_DAYS = 30 // matches DEFAULT_COGNITIVE_RETENTION_POLICY.staleValidationDays
export const FACT_STALENESS_DECAY_PER_PERIOD = 0.85 // confidence *= this, once per staleness period elapsed
export const FACT_CONTRADICTION_LOSER_PENALTY = 0.7 // the claim that loses a contradiction is not deleted outright, just distrusted
export const FACT_PRUNE_CONFIDENCE_FLOOR = 0.15

function normalizeFactObject(value: string): string {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Conservative on purpose: only an EXACT match after normalization counts as "the same claim".
 * Any other difference in wording is treated as a possible contradiction and goes through the
 * review path below rather than being assumed equivalent — silently assuming two different
 * phrasings agree is exactly the failure mode this file exists to close off.
 */
export function factsMateriallyDiffer(previousObject: string, incomingObject: string): boolean {
  return normalizeFactObject(previousObject) !== normalizeFactObject(incomingObject)
}

export type FactContradictionDecision = {
  isContradiction: boolean
  winner: 'incoming' | 'existing' | 'none'
  persistedConfidence: number
  revisionKind: 'contradiction' | null
}

/**
 * Called before every upsert. If there's no existing fact, or the incoming claim matches the
 * existing one, this is not a contradiction — the existing/no-op confidence just passes through
 * (a reaffirmation is allowed to raise confidence toward the incoming value, never silently drop it).
 * If the claims differ, higher confidence wins; the loser's confidence is penalized rather than the
 * row being deleted, and the caller is expected to log a revision either way.
 */
export function resolveFactContradiction(
  existing: Pick<KnowledgeFact, 'object' | 'confidence'> | null,
  incoming: Pick<KnowledgeFact, 'object' | 'confidence'>,
): FactContradictionDecision {
  if (!existing) {
    return { isContradiction: false, winner: 'incoming', persistedConfidence: incoming.confidence, revisionKind: null }
  }
  if (!factsMateriallyDiffer(existing.object, incoming.object)) {
    const persistedConfidence = Math.max(existing.confidence, incoming.confidence)
    return { isContradiction: false, winner: 'incoming', persistedConfidence, revisionKind: null }
  }
  const incomingWins = incoming.confidence >= existing.confidence
  const persistedConfidence = incomingWins
    ? incoming.confidence
    : existing.confidence * FACT_CONTRADICTION_LOSER_PENALTY
  return {
    isContradiction: true,
    winner: incomingWins ? 'incoming' : 'existing',
    persistedConfidence: Math.max(0, Math.min(1, persistedConfidence)),
    revisionKind: 'contradiction',
  }
}

export function daysSince(updatedAt: Date, now: Date = new Date()): number {
  return Math.max(0, (now.getTime() - updatedAt.getTime()) / 86_400_000)
}

/**
 * How many full staleness periods have elapsed since a fact was last written or reaffirmed, and
 * what its confidence becomes after decaying once per period. A fact touched last week is not
 * decayed at all; a fact untouched for 3x the staleness window has decayed three times.
 */
export function decayedFactConfidence(
  currentConfidence: number,
  updatedAt: Date,
  now: Date = new Date(),
  stalenessDays: number = FACT_STALENESS_DAYS,
  decayPerPeriod: number = FACT_STALENESS_DECAY_PER_PERIOD,
): { periodsElapsed: number; decayedConfidence: number } {
  const periodsElapsed = Math.floor(daysSince(updatedAt, now) / Math.max(1, stalenessDays))
  const decayedConfidence = currentConfidence * Math.pow(decayPerPeriod, periodsElapsed)
  return { periodsElapsed, decayedConfidence: Math.max(0, Math.min(1, decayedConfidence)) }
}

export function shouldPruneFact(confidence: number, floor: number = FACT_PRUNE_CONFIDENCE_FLOOR): boolean {
  return confidence < floor
}

// Minimal duck-typed shape instead of importing cosServiceDb's return type, so this file has zero
// `@/` value imports and stays loadable under plain `node --test` (see note above the imports).
type FactRevisionDb = { from: (table: string) => { insert: (payload: Record<string, unknown>) => PromiseLike<{ error: unknown }> } }

async function recordFactRevision(
  db: FactRevisionDb,
  args: {
    taskId: string; subject: string; predicate: string
    revisionKind: 'contradiction' | 'staleness_decay' | 'pruned'
    previousObject: string | null; previousConfidence: number | null
    newObject: string | null; newConfidence: number | null
    reason: string
  },
): Promise<void> {
  const result = await db.from('cos_knowledge_fact_revisions').insert({
    task_id: args.taskId,
    subject: args.subject,
    predicate: args.predicate,
    revision_kind: args.revisionKind,
    previous_object: args.previousObject,
    previous_confidence: args.previousConfidence,
    new_object: args.newObject,
    new_confidence: args.newConfidence,
    reason: args.reason,
  })
  if (result.error) throw result.error
}

/**
 * Fetches every fact untouched since the staleness window, decays its confidence, updates the row,
 * and audits the change. Facts that decay below the prune floor here are recorded as 'staleness_decay'
 * this pass — pruneWeakKnowledgeFacts() is a separate, explicit second step so decay and deletion are
 * never the same action.
 */
export async function weakenStaleKnowledgeFacts(limit = 20): Promise<Array<Record<string, unknown>>> {
  const { cosServiceDb } = await import('@/lib/cos-core/storage/supabase')
  const db = cosServiceDb()
  if (!db) return []
  const cutoff = new Date(Date.now() - FACT_STALENESS_DAYS * 86_400_000).toISOString()
  const result = await db.from('cos_knowledge_facts')
    .select('id,task_id,subject,predicate,object,confidence,updated_at')
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(Math.max(1, limit))
  if (result.error) throw result.error

  const decayed: Array<Record<string, unknown>> = []
  for (const row of result.data || []) {
    const { periodsElapsed, decayedConfidence } = decayedFactConfidence(Number(row.confidence), new Date(row.updated_at))
    if (periodsElapsed < 1 || decayedConfidence >= Number(row.confidence)) continue
    const update = await db.from('cos_knowledge_facts').update({
      confidence: decayedConfidence,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    if (update.error) throw update.error
    await recordFactRevision(db, {
      taskId: row.task_id, subject: row.subject, predicate: row.predicate,
      revisionKind: 'staleness_decay',
      previousObject: row.object, previousConfidence: Number(row.confidence),
      newObject: row.object, newConfidence: decayedConfidence,
      reason: `${periodsElapsed} staleness period(s) elapsed with no reaffirmation`,
    })
    decayed.push({ subject: row.subject, predicate: row.predicate, fromConfidence: row.confidence, toConfidence: decayedConfidence })
  }
  return decayed
}

/**
 * Deletes facts already at or below the prune floor. Run this AFTER weakenStaleKnowledgeFacts in
 * the same cycle, never before — pruning is only ever the second step of an already-decayed fact,
 * not a shortcut applied to a fact that has never been given a chance to decay first.
 */
export async function pruneWeakKnowledgeFacts(limit = 20): Promise<Array<Record<string, unknown>>> {
  const { cosServiceDb } = await import('@/lib/cos-core/storage/supabase')
  const db = cosServiceDb()
  if (!db) return []
  const result = await db.from('cos_knowledge_facts')
    .select('id,task_id,subject,predicate,object,confidence')
    .lt('confidence', FACT_PRUNE_CONFIDENCE_FLOOR)
    .order('confidence', { ascending: true })
    .limit(Math.max(1, limit))
  if (result.error) throw result.error

  const pruned: Array<Record<string, unknown>> = []
  for (const row of result.data || []) {
    await recordFactRevision(db, {
      taskId: row.task_id, subject: row.subject, predicate: row.predicate,
      revisionKind: 'pruned',
      previousObject: row.object, previousConfidence: Number(row.confidence),
      newObject: null, newConfidence: null,
      reason: `confidence ${Number(row.confidence).toFixed(3)} below prune floor ${FACT_PRUNE_CONFIDENCE_FLOOR}`,
    })
    const del = await db.from('cos_knowledge_facts').delete().eq('id', row.id)
    if (del.error) throw del.error
    pruned.push({ subject: row.subject, predicate: row.predicate, confidence: row.confidence })
  }
  return pruned
}

export { recordFactRevision }
