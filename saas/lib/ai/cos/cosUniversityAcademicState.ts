import {
  buildCosUniversityTranscript,
  type CosUniversityAssessmentEvidence,
  type CosUniversityAssessmentKind,
  type CosUniversityGrade,
  type CosUniversitySubjectId,
  type CosUniversityTranscriptEntry,
} from './cosUniversity.ts'
import {
  buildCosPlatformLanguageTranscript,
  type CosPlatformLanguage,
  type CosPlatformLanguageAssessmentEvidence,
  type CosPlatformLanguageDimension,
  type CosPlatformLanguageTranscriptEntry,
} from './cosUniversityLanguages.ts'

export type CosUniversityScorerAuthority = 'host_private_exam' | 'verified_production' | 'host_capstone'

export type CosUniversityAssessmentRow = {
  assessment_key: string
  subject_id: CosUniversitySubjectId | null
  language_code: CosPlatformLanguage | null
  language_dimension: CosPlatformLanguageDimension | null
  assessment_kind: CosUniversityAssessmentKind
  passed: boolean
  independent_scorer: boolean
  scorer_version: string
  scorer_authority: CosUniversityScorerAuthority
  observed_at: string
  valid_until: string
}

export type CosUniversityAcademicState = {
  subjectTranscript: CosUniversityTranscriptEntry[]
  languageTranscript: CosPlatformLanguageTranscriptEntry[]
  assessmentRows: number
  semantics: 'fresh_independent_assessment_evidence_only'
}

const VALID_SCORER_AUTHORITIES = new Set<CosUniversityScorerAuthority>([
  'host_private_exam',
  'verified_production',
  'host_capstone',
])
const MINIMUM_UNSEEN_PASSES = 2
const GRADE_RANK: Record<CosUniversityGrade, number> = {
  unassessed: -1, F: 0, D: 1, C: 2, B: 3, 'A-': 4, A: 5, 'A+': 6,
}

function validTime(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function gradeEligible(row: CosUniversityAssessmentRow, nowMs: number): boolean {
  const validUntil = validTime(row.valid_until)
  const observedAt = validTime(row.observed_at)
  if (!row.independent_scorer || !VALID_SCORER_AUTHORITIES.has(row.scorer_authority)) return false
  if (!validUntil || !observedAt || validUntil <= nowMs || validUntil <= observedAt) return false
  if (row.assessment_kind === 'production_transfer' && row.scorer_authority !== 'verified_production') return false
  if (row.assessment_kind === 'capstone' && row.scorer_authority !== 'host_capstone') return false
  return true
}

function unseenPassCount(rows: CosUniversityAssessmentRow[], subjectId: CosUniversitySubjectId): number {
  return rows.filter(row => row.subject_id === subjectId && row.assessment_kind === 'unseen_subject_exam' && row.passed).length
}

function languageUnseenPassCount(
  rows: CosUniversityAssessmentRow[],
  language: CosPlatformLanguage,
  dimension: CosPlatformLanguageDimension,
): number {
  return rows.filter(row => row.language_code === language && row.language_dimension === dimension && row.assessment_kind === 'unseen_subject_exam' && row.passed).length
}

function enforceRepeatedSubjectEvidence(
  transcript: CosUniversityTranscriptEntry[],
  rows: CosUniversityAssessmentRow[],
): CosUniversityTranscriptEntry[] {
  return transcript.map(entry => {
    const count = unseenPassCount(rows, entry.subjectId)
    if (GRADE_RANK[entry.grade] < GRADE_RANK.B || count >= MINIMUM_UNSEEN_PASSES) return entry
    return {
      ...entry,
      grade: 'D',
      reasons: [`Only ${count} fresh independent unseen pass is recorded; ${MINIMUM_UNSEEN_PASSES} materially separate passes are required before B or higher.`, ...entry.reasons],
    }
  })
}

function enforceRepeatedLanguageEvidence(
  transcript: CosPlatformLanguageTranscriptEntry[],
  rows: CosUniversityAssessmentRow[],
): CosPlatformLanguageTranscriptEntry[] {
  return transcript.map(entry => {
    if (GRADE_RANK[entry.grade] < GRADE_RANK.B) return entry
    const weakDimensions = entry.dimensionsPassed.filter(dimension => languageUnseenPassCount(rows, entry.language, dimension) < MINIMUM_UNSEEN_PASSES)
    if (!weakDimensions.length) return entry
    return {
      ...entry,
      grade: 'D',
      reasons: [`Repeated unseen evidence is incomplete. Two fresh independent passes are required in every language dimension; insufficient: ${weakDimensions.join(', ')}.`, ...entry.reasons],
    }
  })
}

/**
 * Pure projection: database rows become transcripts only through fresh independent evidence.
 * Durable transcript promotion additionally requires two separate unseen passes before B or higher;
 * one lucky examination cannot manufacture academic standing.
 */
export function academicStateFromRows(
  rows: CosUniversityAssessmentRow[],
  now = new Date(),
): CosUniversityAcademicState {
  const nowMs = now.getTime()
  const eligibleRows = rows.filter(row => gradeEligible(row, nowMs))
  const subjectEvidence: CosUniversityAssessmentEvidence[] = []
  const languageEvidence: CosPlatformLanguageAssessmentEvidence[] = []

  for (const row of eligibleRows) {
    if (row.subject_id) {
      subjectEvidence.push({
        assessmentId: row.assessment_key,
        subjectId: row.subject_id,
        kind: row.assessment_kind,
        passed: row.passed,
        independentScorer: true,
        fresh: true,
        scorerVersion: row.scorer_version,
        observedAt: row.observed_at,
      })
      continue
    }
    if (row.language_code && row.language_dimension) {
      languageEvidence.push({
        assessmentId: row.assessment_key,
        language: row.language_code,
        dimension: row.language_dimension,
        kind: row.assessment_kind,
        passed: row.passed,
        independentScorer: true,
        fresh: true,
        scorerVersion: row.scorer_version,
        observedAt: row.observed_at,
      })
    }
  }

  return {
    subjectTranscript: enforceRepeatedSubjectEvidence(buildCosUniversityTranscript(subjectEvidence), eligibleRows),
    languageTranscript: enforceRepeatedLanguageEvidence(buildCosPlatformLanguageTranscript(languageEvidence), eligibleRows),
    assessmentRows: rows.length,
    semantics: 'fresh_independent_assessment_evidence_only',
  }
}
