// saas/lib/ai/cos/cosUniversityMassDistillationSemanticReconciliation.ts
import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { classifyCosUniversitySubjects, cosUniversitySubjectById } from './cosUniversity.ts'
import {
  MASS_DISTILLATION_MIN_BATCH,
  MASS_DISTILLATION_SOURCE_POLICY,
  resolveMassDistillationSubject,
} from './cosUniversityMassDistillation.ts'

export const MASS_DISTILLATION_SEMANTIC_RECONCILIATION_PROFILE =
  'cos-university-mass-distillation-semantic-reconciliation-v1' as const

type RetainedRow = Readonly<{
  contentHash: string
  subject: string
  sourceTitle?: unknown
  summary?: unknown
  facts?: unknown
}>

function clean(value: unknown, limit = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function subjectKey(value: unknown): string {
  const raw = clean(value, 240)
  const primary = classifyCosUniversitySubjects(raw)[0]
  return primary ? cosUniversitySubjectById(primary).id : raw.toLowerCase()
}

export function decidePreparedBatchSemanticCohesion(input: {
  batchSubjectId: string
  expectedSourceHashes: readonly string[]
  rows: readonly RetainedRow[]
}) {
  const batchKey = subjectKey(input.batchSubjectId)
  const expected = new Set(input.expectedSourceHashes.map(value => clean(value, 64).toLowerCase()).filter(Boolean))
  const seen = new Set<string>()
  const mismatches: Array<Readonly<{ contentHash: string; resolvedSubject: string; resolvedKey: string }>> = []

  for (const row of input.rows) {
    const contentHash = clean(row.contentHash, 64).toLowerCase()
    if (!expected.has(contentHash) || seen.has(contentHash)) continue
    seen.add(contentHash)
    const resolvedSubject = resolveMassDistillationSubject({
      subject: row.subject,
      sourceTitle: row.sourceTitle,
      summary: row.summary,
      facts: row.facts,
    })
    const resolvedKey = subjectKey(resolvedSubject)
    if (resolvedKey !== batchKey) mismatches.push(Object.freeze({ contentHash, resolvedSubject, resolvedKey }))
  }

  const missingSourceHashes = [...expected].filter(value => !seen.has(value))
  const coherent = expected.size >= MASS_DISTILLATION_MIN_BATCH
    && missingSourceHashes.length === 0
    && mismatches.length === 0

  return Object.freeze({
    coherent,
    batchSubjectId: clean(input.batchSubjectId, 240),
    batchSubjectKey: batchKey,
    expectedSourceCount: expected.size,
    observedSourceCount: seen.size,
    missingSourceHashes: Object.freeze(missingSourceHashes),
    mismatches: Object.freeze(mismatches),
  })
}

/**
 * Revalidate legacy prepared inventory before rolling authorization can spend against it.
 *
 * Batches with live work are never touched. Unclaimed batches, and batches whose only historical
 * run is already failed, may be quarantined when their retained material no longer resolves to the
 * batch subject under the current semantic-cohesion rule. Quarantine spends nothing and makes the
 * source rows eligible for normal canonical repackaging on the same workflow tick.
 */
export async function reconcilePreparedMassDistillationSemanticCohesion(input: { maxBatches?: number } = {}) {
  const db = cosServiceDb()
  if (!db) return Object.freeze({
    ok: true as const,
    skipped: true as const,
    reason: 'service_database_unavailable',
    inspected: 0,
    quarantined: 0,
    batches: [] as unknown[],
  })

  const maxBatches = Math.max(1, Math.min(Number(input.maxBatches) || 100, 200))
  const prepared = await db.from('cos_university_distillation_curriculum_batches')
    .select('batch_key,subject_id,source_hashes,source_count')
    .eq('source_policy', MASS_DISTILLATION_SOURCE_POLICY)
    .eq('status', 'prepared')
    .eq('dispatch_authorized', false)
    .eq('authority_expanded', false)
    .order('prepared_at', { ascending: true })
    .limit(maxBatches)
  if (prepared.error) throw prepared.error
  const rows = prepared.data || []
  if (!rows.length) return Object.freeze({
    ok: true as const,
    skipped: true as const,
    reason: 'no_prepared_batch',
    inspected: 0,
    quarantined: 0,
    batches: [] as unknown[],
  })

  const batchKeys = rows.map((row: any) => clean(row.batch_key, 64)).filter(Boolean)
  const runResult = await db.from('cos_university_mass_distillation_batch_runs')
    .select('batch_key,stage')
    .in('batch_key', batchKeys)
    .limit(1000)
  if (runResult.error) throw runResult.error

  const stagesByBatch = new Map<string, string[]>()
  for (const raw of runResult.data || []) {
    const row: any = raw
    const key = clean(row.batch_key, 64)
    if (!key) continue
    const stages = stagesByBatch.get(key) || []
    stages.push(clean(row.stage, 80))
    stagesByBatch.set(key, stages)
  }

  const eligible = rows.filter((raw: any) => {
    const stages = stagesByBatch.get(clean(raw.batch_key, 64)) || []
    return stages.length === 0 || stages.every(stage => stage === 'failed')
  })
  const sourceHashes = [...new Set(eligible.flatMap((row: any) =>
    Array.isArray(row.source_hashes) ? row.source_hashes.map((value: unknown) => clean(value, 64).toLowerCase()).filter(Boolean) : []
  ))]

  const retained = new Map<string, any>()
  const chunkSize = 200
  for (let offset = 0; offset < sourceHashes.length; offset += chunkSize) {
    const chunk = sourceHashes.slice(offset, offset + chunkSize)
    const found = await db.from('cos_continuous_learning')
      .select('content_hash,subject,source_title,summary,facts')
      .in('content_hash', chunk)
      .limit(chunk.length)
    if (found.error) throw found.error
    for (const raw of found.data || []) {
      const row: any = raw
      retained.set(clean(row.content_hash, 64).toLowerCase(), row)
    }
  }

  const quarantined: Array<Record<string, unknown>> = []
  for (const raw of eligible) {
    const row: any = raw
    const expectedSourceHashes = Array.isArray(row.source_hashes)
      ? row.source_hashes.map((value: unknown) => clean(value, 64).toLowerCase()).filter(Boolean)
      : []
    const decision = decidePreparedBatchSemanticCohesion({
      batchSubjectId: clean(row.subject_id, 240),
      expectedSourceHashes,
      rows: expectedSourceHashes
        .map((contentHash: string) => retained.get(contentHash))
        .filter(Boolean)
        .map((source: any) => ({
          contentHash: source.content_hash,
          subject: source.subject,
          sourceTitle: source.source_title,
          summary: source.summary,
          facts: source.facts,
        })),
    })
    if (decision.coherent) continue

    const now = new Date().toISOString()
    const updated = await db.from('cos_university_distillation_curriculum_batches')
      .update({ status: 'quarantined', updated_at: now })
      .eq('batch_key', row.batch_key)
      .eq('status', 'prepared')
      .eq('dispatch_authorized', false)
      .eq('authority_expanded', false)
      .select('batch_key')
      .maybeSingle()
    if (updated.error) throw updated.error
    if (!updated.data) continue

    const evidence = {
      profile: MASS_DISTILLATION_SEMANTIC_RECONCILIATION_PROFILE,
      claim: 'mass_distillation_prepared_batch_semantic_quarantined',
      batchKey: clean(row.batch_key, 64),
      subjectId: decision.batchSubjectId,
      expectedSourceCount: decision.expectedSourceCount,
      observedSourceCount: decision.observedSourceCount,
      missingSourceCount: decision.missingSourceHashes.length,
      mismatchCount: decision.mismatches.length,
      resolvedMismatchSubjects: [...new Set(decision.mismatches.map(item => item.resolvedSubject))].slice(0, 12),
      providerDispatchAuthorized: false,
      externalCostUsd: 0,
      productionTrafficAuthorized: false,
      authorityExpanded: false,
    }
    const evidenceHash = hash(evidence)
    const eventKey = hash([MASS_DISTILLATION_SEMANTIC_RECONCILIATION_PROFILE, row.batch_key, evidenceHash])
    const recorded = await db.from('cos_university_learning_assurance_events').upsert({
      event_key: eventKey,
      event_type: 'fine_tune',
      subject_id: decision.batchSubjectId,
      candidate_id: `batch:${clean(row.batch_key, 64)}`,
      evidence_hash: evidenceHash,
      evidence,
      verifier: 'host_controller',
      observed_at: now,
    }, { onConflict: 'event_key', ignoreDuplicates: true })
    if (recorded.error) throw recorded.error
    quarantined.push(evidence)
  }

  return Object.freeze({
    ok: true as const,
    skipped: quarantined.length === 0,
    reason: quarantined.length === 0 ? 'all_eligible_prepared_batches_semantically_coherent' : null,
    inspected: eligible.length,
    skippedLiveOrCompleted: rows.length - eligible.length,
    quarantined: quarantined.length,
    batches: Object.freeze(quarantined),
    providerDispatchAuthorized: false,
    externalCostUsd: 0,
    productionTrafficAuthorized: false,
    authorityExpanded: false,
  })
}
