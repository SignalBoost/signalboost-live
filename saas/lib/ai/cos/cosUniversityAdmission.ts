// saas/lib/ai/cos/cosUniversityAdmission.ts
//
// Host-computed admission to the NEXT University program.
//
// PR #1968 made enrollment time-bounded and immutable, which is correct, but it left the University
// with exactly one cohort and no way to open another: the moment the undergraduate credential is
// issued — or the cohort's hard deadline passes — every undergraduate worker lane stops and nothing
// can ever re-open one, because the enrollment table is insert-only and no code inserts into it.
//
// This module is the missing authority. It decides, from host-held evidence alone, whether a new
// program enrollment is due and which one. It never extends an existing cohort (that stays
// prohibited) — it only ever proposes a NEW program key. It grants no credential and no standing.

import type { CosUniversitySubjectId, CosUniversityGrade, CosUniversityTranscriptEntry } from './cosUniversity.ts'
import type { CosUniversityCredential } from './cosUniversityCredentials.ts'
import {
  buildCosUniversityProgramEnrollment,
  cosUniversityProgramTimingStatus,
  type CosUniversityProgramEnrollment,
  type CosUniversityProgramLevel,
} from './cosUniversityPrograms.ts'
import {
  COS_UNIVERSITY_MASTERS_PROGRAM_KEY_PREFIX,
  cosUniversityMastersProgramKey,
  rankCosUniversityMastersTracks,
  type CosUniversityMastersTrackId,
} from './cosUniversityMasters.ts'

export const COS_UNIVERSITY_UNDERGRADUATE_PROGRAM_KEY = 'generalist_undergraduate_v1'

/** Undergraduate grade converted to a comparable standing weight for track selection only. */
const GRADE_WEIGHT: Record<CosUniversityGrade, number> = {
  'A+': 6, A: 5, 'A-': 4, B: 3, C: 2, D: 1, F: 0, unassessed: 0,
}

export type CosUniversityAdmissionDecision =
  | {
      admit: true
      programKey: string
      programLevel: CosUniversityProgramLevel
      trackId: CosUniversityMastersTrackId | null
      reason: 'masters_admission_earned'
      enrollment: CosUniversityProgramEnrollment
    }
  | {
      admit: false
      reason:
        | 'undergraduate_program_active'
        | 'undergraduate_credential_not_issued'
        | 'undergraduate_cohort_expired_without_credential'
        | 'already_enrolled_at_next_level'
        | 'no_eligible_specialization'
    }

export type CosUniversityAdmissionInput = {
  /** Every enrollment the agent holds, at any level. */
  enrollments: readonly CosUniversityProgramEnrollment[]
  /** Every credential the agent has been awarded, at any level. */
  credentials: readonly CosUniversityCredential[]
  /** Current undergraduate subject transcript — used only to choose a specialization. */
  subjectTranscript: readonly CosUniversityTranscriptEntry[]
  now?: Date
}

function enrollmentFor(
  enrollments: readonly CosUniversityProgramEnrollment[],
  programKey: string,
): CosUniversityProgramEnrollment | null {
  return enrollments.find((row) => row.programKey === programKey) ?? null
}

function hasCredentialAtLevel(
  credentials: readonly CosUniversityCredential[],
  level: CosUniversityProgramLevel,
): boolean {
  return credentials.some((row) => row.programLevel === level)
}

function subjectStandingMap(
  transcript: readonly CosUniversityTranscriptEntry[],
): ReadonlyMap<CosUniversitySubjectId, number> {
  const map = new Map<CosUniversitySubjectId, number>()
  for (const entry of transcript) {
    const weight = GRADE_WEIGHT[entry.grade] ?? 0
    const existing = map.get(entry.subjectId) ?? 0
    if (weight > existing) map.set(entry.subjectId, weight)
  }
  return map
}

/**
 * The only admission currently defined is undergraduate → Master's. It requires an ISSUED
 * undergraduate credential, not merely an academically-graduated status: the credential is the
 * host's own record that the degree was awarded, and admission must key off the same artifact the
 * graduation gate writes, so a self-declared standing can never open a program.
 */
export function decideCosUniversityAdmission(input: CosUniversityAdmissionInput): CosUniversityAdmissionDecision {
  const now = input.now instanceof Date ? input.now : new Date()

  const undergraduateCredential = input.credentials.find(
    (row) => row.programLevel === 'undergraduate',
  ) ?? null

  if (!undergraduateCredential) {
    const undergraduate = enrollmentFor(input.enrollments, COS_UNIVERSITY_UNDERGRADUATE_PROGRAM_KEY)
    const timing = cosUniversityProgramTimingStatus(undergraduate, now)
    if (timing === 'deadline_expired') {
      // The cohort ran out of time without earning the degree. Opening a Master's here would launder
      // a failed program into a higher one. Re-entry is an owner decision, not an automatic one.
      return { admit: false, reason: 'undergraduate_cohort_expired_without_credential' }
    }
    return {
      admit: false,
      reason: timing === 'not_enrolled' ? 'undergraduate_credential_not_issued' : 'undergraduate_program_active',
    }
  }

  if (hasCredentialAtLevel(input.credentials, 'masters')) {
    return { admit: false, reason: 'already_enrolled_at_next_level' }
  }

  const existingMasters = input.enrollments.find((row) =>
    row.programLevel === 'masters' || row.programKey.startsWith(COS_UNIVERSITY_MASTERS_PROGRAM_KEY_PREFIX))
  if (existingMasters) {
    return { admit: false, reason: 'already_enrolled_at_next_level' }
  }

  const ranked = rankCosUniversityMastersTracks(subjectStandingMap(input.subjectTranscript))
  const best = ranked.find((entry) => entry.score > 0) ?? null
  if (!best) return { admit: false, reason: 'no_eligible_specialization' }

  const programKey = cosUniversityMastersProgramKey(best.track.id)
  return {
    admit: true,
    programKey,
    programLevel: 'masters',
    trackId: best.track.id,
    reason: 'masters_admission_earned',
    enrollment: buildCosUniversityProgramEnrollment({
      programKey,
      level: 'masters',
      // The Master's calendar starts when admission is computed, never backdated to the degree date.
      enrolledAt: now,
    }),
  }
}
