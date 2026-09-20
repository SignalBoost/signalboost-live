// saas/lib/ai/cos/cosUniversityDistillationCurriculumPlan.ts
import type { KnowledgeGap } from '../../cos-core/layers/learning/index.ts'
import { COS_UNIVERSITY_SUBJECTS, cosUniversitySubjectById } from './cosUniversity.ts'
import type { MassDistillationSubjectSupply } from './cosUniversityMassDistillation.ts'

// Curriculum acquisition is non-spending and should keep pace with the five-minute distillation
// control loop. Provider training authority remains governed separately by the rolling policy.
export const MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES = 5
export const MASS_DISTILLATION_DEFAULT_PREPARED_BATCH_BUFFER_TARGET = 10
export const MASS_DISTILLATION_DEFAULT_TARGET_SUBJECTS = 3
export const MASS_DISTILLATION_DEFAULT_QUERIES_PER_SUBJECT = 3
export const MASS_DISTILLATION_DEFAULT_ACQUISITION_CANDIDATES_PER_CYCLE = 40
export const MASS_DISTILLATION_DEFAULT_CORPUS_SCAN_ROWS = 5_000
export const MASS_DISTILLATION_DEFAULT_MAX_BATCHES_PER_SWEEP = 20
// Unique items one batch needs; mirrors MASS_DISTILLATION_MIN_BATCH (a type-only import keeps this module dependency-free).
export const MASS_DISTILLATION_REPLENISHMENT_BATCH_ITEMS = 20

export type MassDistillationThroughputProfile = Readonly<{
  preparedBatchBufferTarget: number
  targetSubjectsPerReplenishment: number
  queriesPerSubject: number
  acquisitionCandidatesPerCycle: number
  corpusScanRows: number
  maxBatchesPerSweep: number
}>

function positiveSafeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Throughput belongs to the deployment owner/buyer, not to SignalBoost or a provider adapter.
 * University uses deployment-owner environment settings as the current control surface; the later
 * portable can bind the same profile to buyer-owned configuration/UI. There is deliberately no
 * vendor-imposed throughput maximum here. Governance and spending authority remain separate gates.
 */
export function massDistillationThroughputProfile(env: NodeJS.ProcessEnv = process.env): MassDistillationThroughputProfile {
  return Object.freeze({
    preparedBatchBufferTarget: positiveSafeInteger(
      env.DISTILLATION_PREPARED_BUFFER_TARGET ?? env.COS_UNIVERSITY_DISTILLATION_PREPARED_BUFFER_TARGET,
      MASS_DISTILLATION_DEFAULT_PREPARED_BATCH_BUFFER_TARGET,
    ),
    targetSubjectsPerReplenishment: positiveSafeInteger(
      env.DISTILLATION_TARGET_SUBJECTS,
      MASS_DISTILLATION_DEFAULT_TARGET_SUBJECTS,
    ),
    queriesPerSubject: positiveSafeInteger(
      env.DISTILLATION_QUERIES_PER_SUBJECT,
      MASS_DISTILLATION_DEFAULT_QUERIES_PER_SUBJECT,
    ),
    acquisitionCandidatesPerCycle: positiveSafeInteger(
      env.DISTILLATION_ACQUISITION_CANDIDATES_PER_CYCLE,
      MASS_DISTILLATION_DEFAULT_ACQUISITION_CANDIDATES_PER_CYCLE,
    ),
    corpusScanRows: positiveSafeInteger(
      env.DISTILLATION_CORPUS_SCAN_ROWS,
      MASS_DISTILLATION_DEFAULT_CORPUS_SCAN_ROWS,
    ),
    maxBatchesPerSweep: positiveSafeInteger(
      env.DISTILLATION_MAX_BATCHES_PER_SWEEP,
      MASS_DISTILLATION_DEFAULT_MAX_BATCHES_PER_SWEEP,
    ),
  })
}

/** Backward-compatible accessor used by existing workflow/tests. */
export function massDistillationPreparedBatchBufferTarget(env: NodeJS.ProcessEnv = process.env): number {
  return massDistillationThroughputProfile(env).preparedBatchBufferTarget
}

const REPLENISHMENT_RESEARCH_LENSES = [
  'empirical findings',
  'methods evidence',
  'systematic review',
  'comparative analysis',
  'applications limitations',
  'measurement validation',
] as const

/**
 * Prefer the subjects closest to a valid batch, but do not keep asking one identical search for each
 * subject. The live workflow explicitly supplies the owner-controlled query count. The helper keeps
 * a one-query default for callers that only need prioritization semantics.
 */
export function buildMassDistillationReplenishmentGaps(
  supply: readonly MassDistillationSubjectSupply[],
  now = new Date(),
  maxSubjects = MASS_DISTILLATION_DEFAULT_TARGET_SUBJECTS,
  queriesPerSubject = 1,
): KnowledgeGap[] {
  const replenishmentSlot = Math.floor(now.getTime() / (MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES * 60_000))
  const limit = Math.max(1, Math.floor(maxSubjects))
  const partial = supply
    .filter(subject => subject.canonicalSubjectId && subject.uniqueBatchableItems > 0 && subject.shortfallToBatch > 0)
    .sort((a, b) => a.shortfallToBatch - b.shortfallToBatch || b.uniqueBatchableItems - a.uniqueBatchableItems || a.subjectKey.localeCompare(b.subjectKey))
  // A subject whose items were just packaged into a batch drops out of the supply list entirely. Filtering only on
  // supplied subjects therefore idled replenishment (Production 2026-09-16: "no_targetable_subject_shortfall" while no
  // batch was prepared and Hugging Face sat idle). Empty canonical subjects fill the remaining slots, rotating per slot.
  const present = new Set(partial.map(subject => subject.canonicalSubjectId))
  const empty = COS_UNIVERSITY_SUBJECTS.filter(subject => !present.has(subject.id)
    && !supply.some(entry => entry.canonicalSubjectId === subject.id && entry.shortfallToBatch <= 0))
  const rotatedEmpty = empty.map((_, index) => empty[(replenishmentSlot + index) % empty.length])
    .map((subject): MassDistillationSubjectSupply => ({ subjectKey: subject.id, subject: subject.title, canonicalSubjectId: subject.id, uniqueBatchableItems: 0, shortfallToBatch: MASS_DISTILLATION_REPLENISHMENT_BATCH_ITEMS }))
  const selected = [...partial, ...rotatedEmpty].slice(0, limit)

  const gaps: KnowledgeGap[] = []
  const queryCount = Math.max(1, Math.floor(queriesPerSubject))
  for (const [subjectIndex, supplySubject] of selected.entries()) {
    const subject = cosUniversitySubjectById(supplySubject.canonicalSubjectId!)
    for (let queryIndex = 0; queryIndex < queryCount; queryIndex += 1) {
      const theme = subject.studyThemes[(replenishmentSlot + subjectIndex + queryIndex) % subject.studyThemes.length]
      const lens = REPLENISHMENT_RESEARCH_LENSES[
        (replenishmentSlot + subjectIndex * queryCount + queryIndex) % REPLENISHMENT_RESEARCH_LENSES.length
      ]
      gaps.push({
        id: `distillation-curriculum:${subject.id}:q${queryIndex + 1}`,
        subject: subject.title,
        question: `What rigorous, reusable ${lens} strengthen ${theme} within ${subject.title}?`,
        discoveryQuery: `${theme} ${lens} ${subject.title}`,
        portableIds: ['cos'],
        expectedReuse: 100,
        expectedAvoidedCostUsd: 10,
        urgency: 100,
        evidence: [
          'mass_distillation_post_dedup_supply_shortfall',
          `unique_batchable_items=${supplySubject.uniqueBatchableItems}`,
          `shortfall_to_batch=${supplySubject.shortfallToBatch}`,
          `query_variant=${queryIndex + 1}/${queryCount}`,
        ],
        sourceKinds: ['scientific_journal'],
        curriculumAligned: true,
      })
    }
  }
  return gaps
}
