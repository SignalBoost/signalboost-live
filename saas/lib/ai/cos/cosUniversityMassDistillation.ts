import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const COS_UNIVERSITY_MASS_DISTILLATION_PROFILE = 'cos-university-mass-distillation-v1' as const
export const MASS_DISTILLATION_SOURCE_POLICY = 'public_domain_cc0_v1' as const
export const MASS_DISTILLATION_STUDENT_MODEL = 'Qwen/Qwen3-4B' as const
export const MASS_DISTILLATION_MIN_CONFIDENCE = 0.80
export const MASS_DISTILLATION_MIN_BATCH = 20
export const MASS_DISTILLATION_MAX_BATCH = 128
export const MASS_DISTILLATION_MAX_BATCHES_PER_RUN = 20

const HEX64 = /^[a-f0-9]{64}$/i

export type DistillationRightsClass = 'public_domain' | 'cc0' | 'itmounts_synthetic'
export type RetainedDistillationIdentity = Readonly<{
  contentHash: string
  subject: string
  sourceKind: string
  license: string
  confidence: number
  materialFingerprint?: string
}>

export type PreparedDistillationBatch = Readonly<{
  batchKey: string
  curriculumHash: string
  subjectId: string
  studentModelId: string
  sourceHashes: readonly string[]
  rightsClasses: readonly DistillationRightsClass[]
  sourceCount: number
}>

function clean(value: unknown, limit = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function normalizedSubject(value: string): string {
  return clean(value, 240).toLowerCase()
}

function retainedFactsForFingerprint(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 8).map(item => {
    if (typeof item === 'string') return clean(item, 1200)
    try { return clean(JSON.stringify(item), 1200) } catch { return '' }
  }).filter(Boolean)
}

/**
 * Hash only the retained material that becomes a teacher prompt. Provenance/content hashes may differ
 * while the retained title, summary and facts are identical; those rows must count once for training
 * diversity. The fingerprint is used in memory only and source text still never enters the batch queue.
 */
export function retainedMaterialFingerprint(input: {
  sourceTitle?: unknown
  summary?: unknown
  facts?: unknown
}): string {
  return hash({
    sourceTitle: clean(input.sourceTitle, 400),
    summary: clean(input.summary, 7000),
    facts: retainedFactsForFingerprint(input.facts),
  })
}

/**
 * Keep the first mass-distillation lane deliberately conservative. Public-domain and CC0 material can
 * seed synthetic teacher examples without silently turning ordinary copyrighted learning sources into
 * model-training data. iTMounts-owned synthetic fixtures are also allowed. Other licenses stay in RAG
 * until a separate rights policy explicitly admits them.
 */
export function classifyMassDistillationRights(licenseInput: unknown): DistillationRightsClass | null {
  const license = clean(licenseInput, 1000).toLowerCase()
  if (!license) return null
  if (license === 'public domain') return 'public_domain'
  if (license === 'synthetic-benchmark-fixture') return 'itmounts_synthetic'
  if (license === 'cc0' || license.startsWith('cc0 ') || license.startsWith('openalex cc0 ')) return 'cc0'
  return null
}

export function retainedIdentityEligibleForMassDistillation(row: RetainedDistillationIdentity): boolean {
  return HEX64.test(clean(row.contentHash, 64))
    && clean(row.subject, 240).length >= 3
    && Number.isFinite(row.confidence)
    && row.confidence >= MASS_DISTILLATION_MIN_CONFIDENCE
    && classifyMassDistillationRights(row.license) !== null
}

/** Deterministically package unique retained material identities by subject; no source text enters this queue. */
export function buildMassDistillationBatches(
  rows: readonly RetainedDistillationIdentity[],
  assignedHashes: ReadonlySet<string> = new Set(),
  maxBatches = MASS_DISTILLATION_MAX_BATCHES_PER_RUN,
): PreparedDistillationBatch[] {
  const groups = new Map<string, { subject: string; rows: RetainedDistillationIdentity[]; materialFingerprints: Set<string> }>()
  for (const raw of rows) {
    const row = {
      contentHash: clean(raw.contentHash, 64).toLowerCase(),
      subject: clean(raw.subject, 240),
      sourceKind: clean(raw.sourceKind, 80),
      license: clean(raw.license, 1000),
      confidence: Number(raw.confidence),
      materialFingerprint: clean(raw.materialFingerprint, 64).toLowerCase(),
    }
    if (!retainedIdentityEligibleForMassDistillation(row) || assignedHashes.has(row.contentHash)) continue
    const key = normalizedSubject(row.subject)
    const group = groups.get(key) || { subject: row.subject, rows: [], materialFingerprints: new Set<string>() }
    if (group.rows.some(item => item.contentHash === row.contentHash)) continue
    if (HEX64.test(row.materialFingerprint) && group.materialFingerprints.has(row.materialFingerprint)) continue
    group.rows.push(row)
    if (HEX64.test(row.materialFingerprint)) group.materialFingerprints.add(row.materialFingerprint)
    groups.set(key, group)
  }

  const out: PreparedDistillationBatch[] = []
  const boundedMax = Math.max(1, Math.min(100, Math.floor(maxBatches)))
  const orderedGroups = [...groups.entries()].sort((a, b) => b[1].rows.length - a[1].rows.length || a[0].localeCompare(b[0]))
  for (const [subjectKey, group] of orderedGroups) {
    const ordered = [...group.rows].sort((a, b) => a.contentHash.localeCompare(b.contentHash))
    for (let offset = 0; offset + MASS_DISTILLATION_MIN_BATCH <= ordered.length; offset += MASS_DISTILLATION_MAX_BATCH) {
      const chunk = ordered.slice(offset, offset + MASS_DISTILLATION_MAX_BATCH)
      if (chunk.length < MASS_DISTILLATION_MIN_BATCH) break
      const sourceHashes = chunk.map(item => item.contentHash)
      const rightsClasses = [...new Set(chunk.map(item => classifyMassDistillationRights(item.license)).filter((value): value is DistillationRightsClass => Boolean(value)))].sort()
      const curriculumHash = hash({
        profile: COS_UNIVERSITY_MASS_DISTILLATION_PROFILE,
        sourcePolicy: MASS_DISTILLATION_SOURCE_POLICY,
        subject: subjectKey,
        studentModelId: MASS_DISTILLATION_STUDENT_MODEL,
        sourceHashes,
      })
      const batchKey = hash({ curriculumHash, rightsClasses, minimumConfidence: MASS_DISTILLATION_MIN_CONFIDENCE })
      out.push(Object.freeze({
        batchKey,
        curriculumHash,
        subjectId: group.subject,
        studentModelId: MASS_DISTILLATION_STUDENT_MODEL,
        sourceHashes: Object.freeze(sourceHashes),
        rightsClasses: Object.freeze(rightsClasses),
        sourceCount: sourceHashes.length,
      }))
      if (out.length >= boundedMax) return out
    }
  }
  return out
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => clean(item, 64).toLowerCase()).filter(item => HEX64.test(item)) : []
}

/** Non-spending packaging sweep; provider dispatch remains a separate owner-governed consequence. */
export async function prepareUniversityMassDistillationCurriculum(now = new Date()) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')

  const existing = await db.from('cos_university_distillation_curriculum_batches')
    .select('source_hashes')
    .eq('source_policy', MASS_DISTILLATION_SOURCE_POLICY)
    .limit(1000)
  if (existing.error) throw existing.error
  const assigned = new Set<string>()
  for (const row of existing.data || []) for (const digest of stringArray((row as any).source_hashes)) assigned.add(digest)

  const corpus = await db.from('cos_continuous_learning')
    .select('content_hash,subject,source_kind,license,confidence,source_title,summary,facts')
    .gte('confidence', MASS_DISTILLATION_MIN_CONFIDENCE)
    .order('created_at', { ascending: true })
    .limit(5000)
  if (corpus.error) throw corpus.error

  const identities: RetainedDistillationIdentity[] = (corpus.data || []).map((row: any) => ({
    contentHash: clean(row.content_hash, 64),
    subject: clean(row.subject, 240),
    sourceKind: clean(row.source_kind, 80),
    license: clean(row.license, 1000),
    confidence: Number(row.confidence),
    materialFingerprint: retainedMaterialFingerprint({
      sourceTitle: row.source_title,
      summary: row.summary,
      facts: row.facts,
    }),
  }))
  const eligible = identities.filter(retainedIdentityEligibleForMassDistillation)
  const unassigned = eligible.filter(row => !assigned.has(row.contentHash))
  const batches = buildMassDistillationBatches(identities, assigned)

  if (batches.length) {
    const inserted = await db.from('cos_university_distillation_curriculum_batches').upsert(batches.map(batch => ({
      batch_key: batch.batchKey,
      curriculum_hash: batch.curriculumHash,
      subject_id: batch.subjectId,
      student_model_id: batch.studentModelId,
      source_policy: MASS_DISTILLATION_SOURCE_POLICY,
      source_hashes: [...batch.sourceHashes],
      source_count: batch.sourceCount,
      rights_classes: [...batch.rightsClasses],
      minimum_confidence: MASS_DISTILLATION_MIN_CONFIDENCE,
      status: 'prepared',
      dispatch_authorized: false,
      authority_expanded: false,
      prepared_at: now.toISOString(),
      updated_at: now.toISOString(),
    })), { onConflict: 'batch_key', ignoreDuplicates: true })
    if (inserted.error) throw inserted.error
  }

  const sourceItemsPrepared = batches.reduce((sum, batch) => sum + batch.sourceCount, 0)
  return Object.freeze({
    profile: COS_UNIVERSITY_MASS_DISTILLATION_PROFILE,
    sourcePolicy: MASS_DISTILLATION_SOURCE_POLICY,
    studentModelId: MASS_DISTILLATION_STUDENT_MODEL,
    considered: identities.length,
    eligible: eligible.length,
    alreadyAssigned: eligible.length - unassigned.length,
    unassigned: unassigned.length,
    batchesPrepared: batches.length,
    sourceItemsPrepared,
    dispatchAuthorized: false,
    externalCostUsd: 0,
    semantics: 'rights_cleared_identity_packaging_material_dedup_only_no_text_persisted_no_provider_dispatch_no_traffic_authorization' as const,
  })
}
