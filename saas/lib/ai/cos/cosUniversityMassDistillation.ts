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
const ACTIVE_BATCH_STATUSES = new Set(['prepared', 'teacher_synthesis_ready', 'consumed'])
const TERMINAL_REPACKAGE_STATUSES = new Set(['quarantined', 'superseded'])

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

type NormalizedIdentity = Readonly<{
  contentHash: string
  subject: string
  sourceKind: string
  license: string
  confidence: number
  materialFingerprint: string
}>

function normalizeIdentity(raw: RetainedDistillationIdentity): NormalizedIdentity {
  return Object.freeze({
    contentHash: clean(raw.contentHash, 64).toLowerCase(),
    subject: clean(raw.subject, 240),
    sourceKind: clean(raw.sourceKind, 80),
    license: clean(raw.license, 1000),
    confidence: Number(raw.confidence),
    materialFingerprint: clean(raw.materialFingerprint, 64).toLowerCase(),
  })
}

/** Deterministically package unique retained material identities by subject; no source text enters this queue. */
export function buildMassDistillationBatches(
  rows: readonly RetainedDistillationIdentity[],
  assignedHashes: ReadonlySet<string> = new Set(),
  maxBatches = MASS_DISTILLATION_MAX_BATCHES_PER_RUN,
  terminalAttemptByCurriculumHash: ReadonlyMap<string, string> = new Map(),
): PreparedDistillationBatch[] {
  const normalized = rows.map(normalizeIdentity)
  const groups = new Map<string, { subject: string; rows: NormalizedIdentity[]; materialFingerprints: Set<string> }>()

  // Seed each subject's material set from every active/consumed assignment before considering replacements.
  // This is deliberately a first pass so corpus ordering cannot let an alternate provenance hash slip in first.
  for (const row of normalized) {
    if (!retainedIdentityEligibleForMassDistillation(row) || !assignedHashes.has(row.contentHash)) continue
    const key = normalizedSubject(row.subject)
    const group = groups.get(key) || { subject: row.subject, rows: [], materialFingerprints: new Set<string>() }
    if (HEX64.test(row.materialFingerprint)) group.materialFingerprints.add(row.materialFingerprint)
    groups.set(key, group)
  }

  for (const row of normalized) {
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
      const priorTerminalBatchKey = clean(terminalAttemptByCurriculumHash.get(curriculumHash), 64).toLowerCase()
      const batchKeySeed = { curriculumHash, rightsClasses, minimumConfidence: MASS_DISTILLATION_MIN_CONFIDENCE }
      const batchKey = HEX64.test(priorTerminalBatchKey)
        ? hash({ ...batchKeySeed, repackagedFromBatchKey: priorTerminalBatchKey })
        : hash(batchKeySeed)
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
    .select('batch_key,curriculum_hash,source_hashes,status,updated_at')
    .eq('source_policy', MASS_DISTILLATION_SOURCE_POLICY)
    .in('status', ['prepared', 'teacher_synthesis_ready', 'consumed', 'quarantined', 'superseded'])
    .order('updated_at', { ascending: false })
    .limit(1000)
  if (existing.error) throw existing.error
  const assigned = new Set<string>()
  const terminalAttemptByCurriculumHash = new Map<string, string>()
  for (const raw of existing.data || []) {
    const row: any = raw
    const status = clean(row.status, 40)
    if (ACTIVE_BATCH_STATUSES.has(status)) {
      for (const digest of stringArray(row.source_hashes)) assigned.add(digest)
      continue
    }
    if (!TERMINAL_REPACKAGE_STATUSES.has(status)) continue
    const curriculumHash = clean(row.curriculum_hash, 64).toLowerCase()
    const batchKey = clean(row.batch_key, 64).toLowerCase()
    // Rows are newest-first, so the first terminal key is the immediate prior attempt for this curriculum.
    if (HEX64.test(curriculumHash) && HEX64.test(batchKey) && !terminalAttemptByCurriculumHash.has(curriculumHash)) {
      terminalAttemptByCurriculumHash.set(curriculumHash, batchKey)
    }
  }

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
  const assignedMaterialFingerprintsBySubject = new Map<string, Set<string>>()
  for (const row of eligible) {
    if (!assigned.has(clean(row.contentHash, 64).toLowerCase())) continue
    const fingerprint = clean(row.materialFingerprint, 64).toLowerCase()
    if (!HEX64.test(fingerprint)) continue
    const subject = normalizedSubject(row.subject)
    const fingerprints = assignedMaterialFingerprintsBySubject.get(subject) || new Set<string>()
    fingerprints.add(fingerprint)
    assignedMaterialFingerprintsBySubject.set(subject, fingerprints)
  }
  const unassigned = eligible.filter(row => {
    const contentHash = clean(row.contentHash, 64).toLowerCase()
    if (assigned.has(contentHash)) return false
    const fingerprint = clean(row.materialFingerprint, 64).toLowerCase()
    if (!HEX64.test(fingerprint)) return true
    return !assignedMaterialFingerprintsBySubject.get(normalizedSubject(row.subject))?.has(fingerprint)
  })
  const batches = buildMassDistillationBatches(
    identities,
    assigned,
    MASS_DISTILLATION_MAX_BATCHES_PER_RUN,
    terminalAttemptByCurriculumHash,
  )

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
