// saas/lib/ai/cos/cosUniversityMassDistillation.ts
import { createHash } from 'node:crypto'
// Type-only: the alias is erased at runtime, so importing this module for its pure packaging helpers
// (rights classification, batch building, supply analysis) does not drag in the storage layer. The Node
// test runner cannot resolve '@/...' path aliases, and a value import here made every one of those pure
// helpers untestable - the suite failed at import before a single assertion ran. The one place that
// actually needs a client loads it lazily below, where Next resolves the alias normally.
import type { cosServiceDb as CosServiceDbFactory } from '@/lib/cos-core/storage/supabase'
import { classifyCosUniversitySubjects, cosUniversitySubjectById, type CosUniversitySubjectId } from './cosUniversity.ts'
import { planHybridDistillationMix, type HybridDistillationOrigin } from './cosUniversityHybridDistillation.ts'
import { CURRENT_UNIVERSITY_STUDENT_PROFILE } from './cosUniversityModelCapabilityRegistry.ts'

export const COS_UNIVERSITY_MASS_DISTILLATION_PROFILE = 'cos-university-mass-distillation-v1' as const
export const MASS_DISTILLATION_SOURCE_POLICY = 'public_domain_cc0_v1' as const
export const MASS_DISTILLATION_STUDENT_MODEL = CURRENT_UNIVERSITY_STUDENT_PROFILE.modelId
export const MASS_DISTILLATION_MIN_CONFIDENCE = 0.80
// Historical/structural minimum retained for legacy evidence compatibility.
export const MASS_DISTILLATION_MIN_BATCH = 20
// Production quality floor for NEW mass batches. 2026-09-22..25 telemetry showed 729/739 recent
// jobs launched with only 20-31 sources and trained on roughly 16-25 examples; independently
// evaluated artifacts showed no reliable holdout/retention gain. New packaging waits for 64 unique
// rights-cleared teaching items so the existing small-batch trainer sees a materially larger cohort.
export const MASS_DISTILLATION_QUALITY_MIN_BATCH = 64
export const MASS_DISTILLATION_MAX_BATCH = 128
// These are University defaults only. Deployment-owner throughput configuration may exceed them.
export const MASS_DISTILLATION_MAX_BATCHES_PER_RUN = 20
export const MASS_DISTILLATION_CORPUS_PAGE_SIZE = 1000
export const MASS_DISTILLATION_CORPUS_MAX_ROWS = 5000
// Failure-derived curriculum must remain visible even after fresher general learning pushes it outside
// the normal bounded corpus window. This is an additive read-only rescue window, never extra dispatch authority.
export const MASS_DISTILLATION_REMEDIATION_SCAN_MAX_ROWS = 1000
const MASS_DISTILLATION_BATCH_WRITE_CHUNK = 100
const MASS_DISTILLATION_EXISTING_BATCH_PAGE_SIZE = 1000

const HEX64 = /^[a-f0-9]{64}$/i
const ACTIVE_BATCH_STATUSES = new Set(['prepared', 'teacher_synthesis_ready', 'consumed'])
const TERMINAL_REPACKAGE_STATUSES = new Set(['quarantined', 'superseded'])
const EFFECTIVE_CORPUS_FILTER = 'fact_extraction_error.is.null,fact_extraction_error.not.ilike.relevance_rejected:%'

export type DistillationRightsClass = 'public_domain' | 'cc0' | 'itmounts_synthetic'
export type RetainedDistillationIdentity = Readonly<{
  contentHash: string
  materialHash: string
  subject: string
  sourceKind: string
  license: string
  confidence: number
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

export type MassDistillationSubjectSupply = Readonly<{
  subjectKey: string
  subject: string
  canonicalSubjectId: CosUniversitySubjectId | null
  uniqueBatchableItems: number
  shortfallToBatch: number
}>

export type MassDistillationSupply = Readonly<{
  eligibleRows: number
  rawUnassignedRows: number
  uniqueBatchableItems: number
  subjects: readonly MassDistillationSubjectSupply[]
}>

type NormalizedIdentity = Readonly<{
  contentHash: string
  materialHash: string
  subject: string
  sourceKind: string
  license: string
  confidence: number
}>

function clean(value: unknown, limit = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function positiveSafeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function normalizedSubject(value: string): string {
  return clean(value, 240).toLowerCase()
}


const STRONG_COMPUTER_SCIENCE_SUPPORT = /\b(computer science|software (?:engineering|development|architecture|systems?|platforms?|production|testing)|programming|algorithms?|data structures?|distributed systems?|operating systems?|apis?|devops|debug(?:ging)?|typescript|javascript|python|next\.?js|cloud computing|kubernetes|microservices?|container orchestration|computer vision|machine learning (?:methods?|models?|algorithms?|systems?|engineering)|deep learning (?:methods?|models?|architectures?|systems?)|deep neural networks?|neural network (?:methods?|models?|architectures?|training)|transformer (?:models?|architectures?)|pytorch|large language models?|llms?|retrieval[- ]augmented generation|embeddings?|vector databases?|ai agents?|computer program)\b/gi

function strongComputerScienceSupportCount(value: string): number {
  const matches = value.match(STRONG_COMPUTER_SCIENCE_SUPPORT) || []
  return new Set(matches.map(match => match.toLowerCase())).size
}

function strictMassDistillationSubject(id: CosUniversitySubjectId, evidence: string, minimumComputerScienceSignals = 1): string {
  if (id === 'computer_science' && strongComputerScienceSupportCount(evidence) < minimumComputerScienceSignals) return ''
  return cosUniversitySubjectById(id).title
}

export function resolveMassDistillationSubject(input: {
  subject?: unknown
  sourceTitle?: unknown
  summary?: unknown
  facts?: unknown
}): string {
  const stored = clean(input.subject, 240)
  const storedIds = classifyCosUniversitySubjects(stored)
  const facts = Array.isArray(input.facts)
    ? input.facts.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ')
    : input.facts == null ? ''
      : typeof input.facts === 'string' ? input.facts : JSON.stringify(input.facts)
  const sourceTitle = clean(input.sourceTitle, 1000)
  const material = [sourceTitle, clean(input.summary, 12_000), clean(facts, 12_000)]
    .filter(Boolean)
    .join(' ')
  const titleIds = classifyCosUniversitySubjects(sourceTitle)
  const materialIds = classifyCosUniversitySubjects(material)

  const storedNormalized = normalizedSubject(stored)
  const titleNormalized = normalizedSubject(sourceTitle)
  const materialNormalized = normalizedSubject(material)
  const titleLiterallyCorroborated = storedNormalized.length >= 3 && titleNormalized.includes(storedNormalized)
  const materialLiterallyCorroborated = storedNormalized.length >= 3 && materialNormalized.includes(storedNormalized)

  // For titled sources, the title is the admission boundary. Abstract/facts can elaborate the item,
  // but incidental words in those fields must not assign an unrelated training subject.
  if (sourceTitle) {
    if (storedIds.length) {
      const storedPrimary = storedIds[0]
      if (titleIds.includes(storedPrimary)) return strictMassDistillationSubject(storedPrimary, sourceTitle)
      if (titleIds.length) return strictMassDistillationSubject(titleIds[0], sourceTitle)
    }
    if (titleIds.length) return strictMassDistillationSubject(titleIds[0], sourceTitle)
    if (titleLiterallyCorroborated) return stored
    return ''
  }

  // Title-less owner/public-domain material has no stronger local identity, so retain the previous
  // conservative material-level fallback.
  if (storedIds.length) {
    const storedPrimary = storedIds[0]
    if (materialIds.includes(storedPrimary) || materialLiterallyCorroborated) {
      return strictMassDistillationSubject(storedPrimary, material, 2)
    }
  }
  if (materialIds.length === 1) return strictMassDistillationSubject(materialIds[0], material, 2)
  if (materialIds.length > 1) return ''
  if (materialLiterallyCorroborated) return stored

  // A stored label with no independent support from the retained teaching material is unsafe for training.
  // Fail closed: unclassifiable material stays available to RAG but is excluded from mass-distillation packaging.
  return ''
}

function distillationSubjectGroup(value: string): Readonly<{ key: string; subject: string; canonicalSubjectId: CosUniversitySubjectId | null }> {
  const raw = clean(value, 240)
  const primary = classifyCosUniversitySubjects(raw)[0]
  if (!primary) return Object.freeze({ key: normalizedSubject(raw), subject: raw, canonicalSubjectId: null })
  const canonical = cosUniversitySubjectById(primary)
  return Object.freeze({ key: canonical.id, subject: canonical.title, canonicalSubjectId: canonical.id })
}

function normalizedMaterialPart(value: unknown, limit: number): string {
  return clean(value, limit).toLowerCase()
}

function normalizedFact(value: unknown): string {
  if (typeof value === 'string') return normalizedMaterialPart(value, 4000)
  try { return normalizedMaterialPart(JSON.stringify(value), 4000) } catch { return '' }
}

/**
 * Fingerprint only the retained teaching material that actually reaches teacher-prompt construction.
 * Provenance/content-row identities may differ while title/summary/facts are byte-for-byte or
 * semantically-normalized duplicates; those rows must count as one curriculum item, not many.
 */
export function retainedMaterialHash(input: {
  sourceTitle?: unknown
  summary?: unknown
  facts?: unknown
}): string | null {
  const sourceTitle = normalizedMaterialPart(input.sourceTitle, 1000)
  const summary = normalizedMaterialPart(input.summary, 12_000)
  const facts = Array.isArray(input.facts)
    ? input.facts.map(normalizedFact).filter(Boolean).sort()
    : input.facts == null ? [] : [normalizedFact(input.facts)].filter(Boolean)
  const material = [sourceTitle, summary, ...facts].filter(Boolean).join('\n')
  if (material.length < 20) return null
  return hash({ sourceTitle, summary, facts })
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
    && HEX64.test(clean(row.materialHash, 64))
    && clean(row.subject, 240).length >= 3
    && Number.isFinite(row.confidence)
    && row.confidence >= MASS_DISTILLATION_MIN_CONFIDENCE
    && classifyMassDistillationRights(row.license) !== null
}

function massDistillationHybridOrigin(sourceKind: string): HybridDistillationOrigin {
  if (sourceKind === 'failure_derived_curriculum') return 'failure_derived'
  if (sourceKind === 'teacher_synthetic_curriculum' || sourceKind === 'teacher_hosted_curriculum') return 'teacher_synthetic'
  return 'real_source'
}

function selectHybridDistillationChunk(rows: readonly NormalizedIdentity[]): NormalizedIdentity[] {
  if (rows.length < MASS_DISTILLATION_QUALITY_MIN_BATCH) return []
  const ordered = [...rows].sort((a, b) => a.contentHash.localeCompare(b.contentHash))
  // Failure-derived curriculum rides inside a full-sized batch; it does not shrink the batch.
  // Production 2026-09-19 -> 2026-09-21: the previous rule packaged a minimum 20-item "corrective
  // cohort" whenever ANY failure-derived row existed. Every failed evaluation produces failure-derived
  // rows, so the rule never released: 170 of 457 batch runs in 48h were exactly 20 items, and no
  // 128-item batch was built after 2026-09-19 20:08 UTC. A 20-item batch trains the LoRA on ~16
  // examples and grades it on ~4 holdout cases; 47 evaluations in 12h then tied baseline on 176 of
  // 188 holdout cases and quarantined, which generated more failure rows - a closed loop.
  // Remediation is not diluted here: planHybridDistillationMix reserves failure-derived rows a fixed
  // share (HYBRID_FAILURE_DERIVED_TARGET) of every batch and gives them any unused synthetic share.
  const targetSize = Math.min(MASS_DISTILLATION_MAX_BATCH, ordered.length)
  const real = ordered.filter(row => massDistillationHybridOrigin(row.sourceKind) === 'real_source')
  const failure = ordered.filter(row => massDistillationHybridOrigin(row.sourceKind) === 'failure_derived')
  const synthetic = ordered.filter(row => massDistillationHybridOrigin(row.sourceKind) === 'teacher_synthetic')
  const mix = planHybridDistillationMix({
    batchSize: targetSize,
    realSourceAvailable: real.length,
    failureDerivedAvailable: failure.length,
  })
  const selected = [
    ...real.slice(0, mix.realSource),
    ...failure.slice(0, mix.failureDerived),
    ...synthetic.slice(0, mix.teacherSynthetic),
  ].sort((a, b) => a.contentHash.localeCompare(b.contentHash))
  return selected.length === targetSize ? selected : []
}

function normalizeIdentity(raw: RetainedDistillationIdentity): NormalizedIdentity {
  return Object.freeze({
    contentHash: clean(raw.contentHash, 64).toLowerCase(),
    materialHash: clean(raw.materialHash, 64).toLowerCase(),
    subject: clean(raw.subject, 240),
    sourceKind: clean(raw.sourceKind, 80),
    license: clean(raw.license, 1000),
    confidence: Number(raw.confidence),
  })
}

/**
 * Report the material the packager can actually use after the same rights, assignment, canonical
 * subject, content, and retained-material de-duplication fences used for batch construction. Raw
 * unassigned row counts are preserved separately so provenance volume cannot masquerade as supply.
 */
export function analyzeMassDistillationSupply(
  rows: readonly RetainedDistillationIdentity[],
  assignedHashes: ReadonlySet<string> = new Set(),
): MassDistillationSupply {
  const normalized = rows.map(normalizeIdentity)
  const eligible = normalized.filter(retainedIdentityEligibleForMassDistillation)
  const groups = new Map<string, {
    subject: string
    canonicalSubjectId: CosUniversitySubjectId | null
    assignedMaterialHashes: Set<string>
    unassignedContentHashes: Set<string>
    uniqueMaterialHashes: Set<string>
  }>()

  const groupFor = (row: NormalizedIdentity) => {
    const subject = distillationSubjectGroup(row.subject)
    const group = groups.get(subject.key) || {
      subject: subject.subject,
      canonicalSubjectId: subject.canonicalSubjectId,
      assignedMaterialHashes: new Set<string>(),
      unassignedContentHashes: new Set<string>(),
      uniqueMaterialHashes: new Set<string>(),
    }
    groups.set(subject.key, group)
    return { subject, group }
  }

  for (const row of eligible) {
    if (!assignedHashes.has(row.contentHash)) continue
    groupFor(row).group.assignedMaterialHashes.add(row.materialHash)
  }

  let rawUnassignedRows = 0
  for (const row of eligible) {
    if (assignedHashes.has(row.contentHash)) continue
    rawUnassignedRows += 1
    const { group } = groupFor(row)
    if (group.unassignedContentHashes.has(row.contentHash)) continue
    group.unassignedContentHashes.add(row.contentHash)
    if (group.assignedMaterialHashes.has(row.materialHash)) continue
    group.uniqueMaterialHashes.add(row.materialHash)
  }

  const subjects = [...groups.entries()]
    .map(([subjectKey, group]) => Object.freeze({
      subjectKey,
      subject: group.subject,
      canonicalSubjectId: group.canonicalSubjectId,
      uniqueBatchableItems: group.uniqueMaterialHashes.size,
      shortfallToBatch: group.uniqueMaterialHashes.size >= MASS_DISTILLATION_QUALITY_MIN_BATCH
        ? 0
        : MASS_DISTILLATION_QUALITY_MIN_BATCH - group.uniqueMaterialHashes.size,
    }))
    .filter(subject => subject.uniqueBatchableItems > 0)
    .sort((a, b) => b.uniqueBatchableItems - a.uniqueBatchableItems || a.subjectKey.localeCompare(b.subjectKey))

  return Object.freeze({
    eligibleRows: eligible.length,
    rawUnassignedRows,
    uniqueBatchableItems: subjects.reduce((sum, subject) => sum + subject.uniqueBatchableItems, 0),
    subjects: Object.freeze(subjects),
  })
}

/** Deterministically package unique retained teaching material by canonical University subject family. */
export function buildMassDistillationBatches(
  rows: readonly RetainedDistillationIdentity[],
  assignedHashes: ReadonlySet<string> = new Set(),
  maxBatches = MASS_DISTILLATION_MAX_BATCHES_PER_RUN,
  terminalAttemptByCurriculumHash: ReadonlyMap<string, string> = new Map(),
): PreparedDistillationBatch[] {
  const normalized = rows.map(normalizeIdentity)
  const groups = new Map<string, {
    subject: string
    rows: NormalizedIdentity[]
    contentHashes: Set<string>
    materialHashes: Set<string>
  }>()

  const groupFor = (row: NormalizedIdentity) => {
    const subject = distillationSubjectGroup(row.subject)
    const group = groups.get(subject.key) || {
      subject: subject.subject,
      rows: [],
      contentHashes: new Set<string>(),
      materialHashes: new Set<string>(),
    }
    groups.set(subject.key, group)
    return group
  }

  // Seed every canonical subject family with material already represented by a live or consumed
  // assignment before considering replacement provenance hashes. This first pass makes the result
  // independent of row order and prevents duplicate teaching material across subject aliases.
  for (const row of normalized) {
    if (!retainedIdentityEligibleForMassDistillation(row) || !assignedHashes.has(row.contentHash)) continue
    groupFor(row).materialHashes.add(row.materialHash)
  }

  for (const row of normalized) {
    if (!retainedIdentityEligibleForMassDistillation(row) || assignedHashes.has(row.contentHash)) continue
    const group = groupFor(row)
    if (group.contentHashes.has(row.contentHash)) continue
    if (group.materialHashes.has(row.materialHash)) continue
    group.contentHashes.add(row.contentHash)
    group.materialHashes.add(row.materialHash)
    group.rows.push(row)
  }

  const out: PreparedDistillationBatch[] = []
  const requestedMax = positiveSafeInteger(maxBatches, MASS_DISTILLATION_MAX_BATCHES_PER_RUN)
  const orderedGroups = [...groups.entries()].sort((a, b) => b[1].rows.length - a[1].rows.length || a[0].localeCompare(b[0]))
  for (const [subjectKey, group] of orderedGroups) {
    let remaining = [...group.rows].sort((a, b) => a.contentHash.localeCompare(b.contentHash))
    while (remaining.length >= MASS_DISTILLATION_QUALITY_MIN_BATCH) {
      const chunk = selectHybridDistillationChunk(remaining)
      if (chunk.length < MASS_DISTILLATION_QUALITY_MIN_BATCH) break
      const selectedHashes = new Set(chunk.map(item => item.contentHash))
      remaining = remaining.filter(item => !selectedHashes.has(item.contentHash))
      const sourceHashes = chunk.map(item => item.contentHash)
      const rightsClasses = [...new Set(chunk.map(item => classifyMassDistillationRights(item.license)).filter((value): value is DistillationRightsClass => Boolean(value)))].sort()
      const curriculumHash = hash({
        profile: COS_UNIVERSITY_MASS_DISTILLATION_PROFILE,
        sourcePolicy: MASS_DISTILLATION_SOURCE_POLICY,
        subject: subjectKey,
        studentModelId: MASS_DISTILLATION_STUDENT_MODEL,
        sourceHashes,
      })
      const batchKeySeed = { curriculumHash, rightsClasses, minimumConfidence: MASS_DISTILLATION_MIN_CONFIDENCE }
      const priorTerminalBatchKey = clean(terminalAttemptByCurriculumHash.get(curriculumHash), 64).toLowerCase()
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
      if (out.length >= requestedMax) return out
    }
  }
  return out
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => clean(item, 64).toLowerCase()).filter(item => HEX64.test(item)) : []
}

async function readMassDistillationCorpus(
  db: NonNullable<ReturnType<typeof CosServiceDbFactory>>,
  maxRows = MASS_DISTILLATION_CORPUS_MAX_ROWS,
  assignedHashes: ReadonlySet<string> = new Set(),
) {
  const requestedRows = positiveSafeInteger(maxRows, MASS_DISTILLATION_CORPUS_MAX_ROWS)
  const rows: any[] = []
  const seenHashes = new Set<string>()

  const retain = (pageRows: readonly any[]) => {
    for (const row of pageRows) {
      const contentHash = clean(row?.content_hash, 64).toLowerCase()
      if (!HEX64.test(contentHash) || seenHashes.has(contentHash)) continue
      seenHashes.add(contentHash)
      rows.push(row)
    }
  }

  for (let offset = 0; offset < requestedRows; offset += MASS_DISTILLATION_CORPUS_PAGE_SIZE) {
    const end = Math.min(offset + MASS_DISTILLATION_CORPUS_PAGE_SIZE, requestedRows) - 1
    const expectedPageSize = end - offset + 1
    const page = await db.from('cos_continuous_learning')
      .select('content_hash,subject,source_kind,license,confidence,source_title,summary,facts')
      .gte('confidence', MASS_DISTILLATION_MIN_CONFIDENCE)
      .or(EFFECTIVE_CORPUS_FILTER)
      // Fresh replenishment must be visible immediately. Oldest-first scanning permanently starves
      // newly acquired/generated curriculum once the retained corpus exceeds the bounded scan window.
      .order('created_at', { ascending: false })
      .order('content_hash', { ascending: true })
      .range(offset, end)
    if (page.error) throw page.error
    const pageRows = page.data ?? []
    retain(pageRows)
    if (pageRows.length < expectedPageSize) break
  }

  // The newest-first window above can legitimately advance past corrective curriculum before enough
  // same-subject material is available to package it. Read a second, tightly bounded remediation-only
  // window so independently verified failures cannot be forgotten merely because general learning is busy.
  // Assigned rows are skipped here because they already have a durable batch identity.
  for (let offset = 0; offset < MASS_DISTILLATION_REMEDIATION_SCAN_MAX_ROWS; offset += MASS_DISTILLATION_CORPUS_PAGE_SIZE) {
    const end = Math.min(offset + MASS_DISTILLATION_CORPUS_PAGE_SIZE, MASS_DISTILLATION_REMEDIATION_SCAN_MAX_ROWS) - 1
    const expectedPageSize = end - offset + 1
    const page = await db.from('cos_continuous_learning')
      .select('content_hash,subject,source_kind,license,confidence,source_title,summary,facts')
      .eq('source_kind', 'failure_derived_curriculum')
      .gte('confidence', MASS_DISTILLATION_MIN_CONFIDENCE)
      .or(EFFECTIVE_CORPUS_FILTER)
      .order('created_at', { ascending: false })
      .order('content_hash', { ascending: true })
      .range(offset, end)
    if (page.error) throw page.error
    const pageRows = page.data ?? []
    retain(pageRows.filter((row: any) => !assignedHashes.has(clean(row?.content_hash, 64).toLowerCase())))
    if (pageRows.length < expectedPageSize) break
  }
  return rows
}

async function readExistingMassDistillationBatches(db: NonNullable<ReturnType<typeof CosServiceDbFactory>>) {
  const rows: any[] = []
  for (let offset = 0; ; offset += MASS_DISTILLATION_EXISTING_BATCH_PAGE_SIZE) {
    const page = await db.from('cos_university_distillation_curriculum_batches')
      .select('batch_key,curriculum_hash,source_hashes,status,updated_at')
      .eq('source_policy', MASS_DISTILLATION_SOURCE_POLICY)
      .in('status', ['prepared', 'teacher_synthesis_ready', 'consumed', 'quarantined', 'superseded'])
      .order('updated_at', { ascending: false })
      .range(offset, offset + MASS_DISTILLATION_EXISTING_BATCH_PAGE_SIZE - 1)
    if (page.error) throw page.error
    const pageRows = page.data ?? []
    rows.push(...pageRows)
    if (pageRows.length < MASS_DISTILLATION_EXISTING_BATCH_PAGE_SIZE) break
  }
  return rows
}

/** Non-spending packaging sweep; provider dispatch remains a separate owner-governed consequence. */
export async function prepareUniversityMassDistillationCurriculum(
  now = new Date(),
  throughput: { corpusScanRows?: number; maxBatchesPerSweep?: number } = {},
) {
  const { cosServiceDb } = await import('@/lib/cos-core/storage/supabase')
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')

  const existingRows = await readExistingMassDistillationBatches(db)
  const assigned = new Set<string>()
  const terminalAttemptByCurriculumHash = new Map<string, string>()
  for (const row of existingRows) {
    const status = clean(row.status, 40)
    if (ACTIVE_BATCH_STATUSES.has(status)) {
      for (const digest of stringArray(row.source_hashes)) assigned.add(digest)
      continue
    }
    if (!TERMINAL_REPACKAGE_STATUSES.has(status)) continue
    const curriculumHash = clean(row.curriculum_hash, 64).toLowerCase()
    const batchKey = clean(row.batch_key, 64).toLowerCase()
    // Existing rows are newest-first; the first terminal key is the immediately prior attempt.
    if (HEX64.test(curriculumHash) && HEX64.test(batchKey) && !terminalAttemptByCurriculumHash.has(curriculumHash)) {
      terminalAttemptByCurriculumHash.set(curriculumHash, batchKey)
    }
  }

  const corpusScanRows = positiveSafeInteger(throughput.corpusScanRows, MASS_DISTILLATION_CORPUS_MAX_ROWS)
  const maxBatchesPerSweep = positiveSafeInteger(throughput.maxBatchesPerSweep, MASS_DISTILLATION_MAX_BATCHES_PER_RUN)
  const corpusRows = await readMassDistillationCorpus(db, corpusScanRows, assigned)
  const identities: RetainedDistillationIdentity[] = corpusRows.map((row: any) => ({
    contentHash: clean(row.content_hash, 64),
    materialHash: retainedMaterialHash({ sourceTitle: row.source_title, summary: row.summary, facts: row.facts }) || '',
    subject: resolveMassDistillationSubject({
      subject: row.subject,
      sourceTitle: row.source_title,
      summary: row.summary,
      facts: row.facts,
    }),
    sourceKind: clean(row.source_kind, 80),
    license: clean(row.license, 1000),
    confidence: Number(row.confidence),
  }))
  const supply = analyzeMassDistillationSupply(identities, assigned)
  const batches = buildMassDistillationBatches(
    identities,
    assigned,
    maxBatchesPerSweep,
    terminalAttemptByCurriculumHash,
  )

  for (let offset = 0; offset < batches.length; offset += MASS_DISTILLATION_BATCH_WRITE_CHUNK) {
    const chunk = batches.slice(offset, offset + MASS_DISTILLATION_BATCH_WRITE_CHUNK)
    const inserted = await db.from('cos_university_distillation_curriculum_batches').upsert(chunk.map(batch => ({
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
    eligible: supply.eligibleRows,
    alreadyAssigned: supply.eligibleRows - supply.uniqueBatchableItems,
    unassigned: supply.uniqueBatchableItems,
    rawUnassignedRows: supply.rawUnassignedRows,
    uniqueBatchableItems: supply.uniqueBatchableItems,
    supply,
    batchesPrepared: batches.length,
    sourceItemsPrepared,
    throughput: Object.freeze({ corpusScanRows, maxBatchesPerSweep }),
    dispatchAuthorized: false,
    externalCostUsd: 0,
    semantics: 'rights_cleared_unique_material_identity_packaging_canonical_university_subjects_owner_controlled_capacity_no_provider_dispatch_no_traffic_authorization' as const,
  })
}
