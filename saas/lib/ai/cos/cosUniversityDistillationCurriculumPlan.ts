import type { KnowledgeGap } from '../../cos-core/layers/learning/index.ts'
import { cosUniversitySubjectById } from './cosUniversity.ts'
import type { MassDistillationSubjectSupply } from './cosUniversityMassDistillation.ts'

export const MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES = 30
export const MASS_DISTILLATION_MAX_TARGET_SUBJECTS = 3

/** Prefer the subjects closest to a valid batch so replenishment turns into useful work quickly. */
export function buildMassDistillationReplenishmentGaps(
  supply: readonly MassDistillationSubjectSupply[],
  now = new Date(),
  maxSubjects = MASS_DISTILLATION_MAX_TARGET_SUBJECTS,
): KnowledgeGap[] {
  const halfHourSlot = Math.floor(now.getTime() / (MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES * 60_000))
  return supply
    .filter(subject => subject.canonicalSubjectId && subject.uniqueBatchableItems > 0 && subject.shortfallToBatch > 0)
    .sort((a, b) => a.shortfallToBatch - b.shortfallToBatch || b.uniqueBatchableItems - a.uniqueBatchableItems || a.subjectKey.localeCompare(b.subjectKey))
    .slice(0, Math.max(1, Math.min(MASS_DISTILLATION_MAX_TARGET_SUBJECTS, Math.floor(maxSubjects))))
    .map((supplySubject, index) => {
      const subject = cosUniversitySubjectById(supplySubject.canonicalSubjectId!)
      const theme = subject.studyThemes[(halfHourSlot + index) % subject.studyThemes.length]
      return {
        id: `distillation-curriculum:${subject.id}`,
        subject: subject.title,
        question: `What rigorous, reusable findings and methods strengthen ${theme} within ${subject.title}?`,
        discoveryQuery: `${theme} ${subject.objective}`,
        portableIds: ['cos'],
        expectedReuse: 100,
        expectedAvoidedCostUsd: 10,
        urgency: 100,
        evidence: [
          'mass_distillation_post_dedup_supply_shortfall',
          `unique_batchable_items=${supplySubject.uniqueBatchableItems}`,
          `shortfall_to_batch=${supplySubject.shortfallToBatch}`,
        ],
        sourceKinds: ['scientific_journal'],
        curriculumAligned: true,
      }
    })
}
