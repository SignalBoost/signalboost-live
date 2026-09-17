import type { KnowledgeGap } from '../../cos-core/layers/learning/index.ts'
import { cosUniversitySubjectById } from './cosUniversity.ts'
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
 *
 * A subject does not need to classify into a canonical University subject before replenishment. The
 * packager can already group unclassified material by its normalized source subject, so refusing to
 * replenish those groups creates a permanent starvation loop: material is visible, no batch reaches
 * 20 unique items, and every replenishment cycle returns no_targetable_subject_shortfall. Canonical
 * subjects still use curated study themes; unclassified groups use their retained subject label as the
 * acquisition theme until enough evidence exists to classify them more specifically.
 */
export function buildMassDistillationReplenishmentGaps(
  supply: readonly MassDistillationSubjectSupply[],
  now = new Date(),
  maxSubjects = MASS_DISTILLATION_DEFAULT_TARGET_SUBJECTS,
  queriesPerSubject = 1,
): KnowledgeGap[] {
  const replenishmentSlot = Math.floor(now.getTime() / (MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES * 60_000))
  const selected = supply
    .filter(subject => subject.uniqueBatchableItems > 0 && subject.shortfallToBatch > 0 && subject.subject.trim().length >= 3)
    .sort((a, b) => a.shortfallToBatch - b.shortfallToBatch || b.uniqueBatchableItems - a.uniqueBatchableItems || a.subjectKey.localeCompare(b.subjectKey))
    .slice(0, Math.max(1, Math.floor(maxSubjects)))

  const gaps: KnowledgeGap[] = []
  const queryCount = Math.max(1, Math.floor(queriesPerSubject))
  for (const [subjectIndex, supplySubject] of selected.entries()) {
    const canonical = supplySubject.canonicalSubjectId ? cosUniversitySubjectById(supplySubject.canonicalSubjectId) : null
    const subjectTitle = canonical?.title || supplySubject.subject.trim()
    const subjectId = canonical?.id || supplySubject.subjectKey
    const themes = canonical?.studyThemes?.length ? canonical.studyThemes : [subjectTitle]
    for (let queryIndex = 0; queryIndex < queryCount; queryIndex += 1) {
      const theme = themes[(replenishmentSlot + subjectIndex + queryIndex) % themes.length]
      const lens = REPLENISHMENT_RESEARCH_LENSES[
        (replenishmentSlot + subjectIndex * queryCount + queryIndex) % REPLENISHMENT_RESEARCH_LENSES.length
      ]
      gaps.push({
        id: `distillation-curriculum:${subjectId}:q${queryIndex + 1}`,
        subject: subjectTitle,
        question: `What rigorous, reusable ${lens} strengthen ${theme} within ${subjectTitle}?`,
        discoveryQuery: `${theme} ${lens} ${subjectTitle}`,
        portableIds: ['cos'],
        expectedReuse: 100,
        expectedAvoidedCostUsd: 10,
        urgency: 100,
        evidence: [
          'mass_distillation_post_dedup_supply_shortfall',
          supplySubject.canonicalSubjectId ? 'subject_mapping=canonical' : 'subject_mapping=retained_fallback',
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
