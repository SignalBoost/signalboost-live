import {
  buildCosUniversityTranscript,
  type CosUniversityAssessmentEvidence,
  type CosUniversityAssessmentKind,
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

/** Pure projection: database rows become transcripts only through fresh independent evidence. */
export function academicStateFromRows(
  rows: CosUniversityAssessmentRow[],
  now = new Date(),
): CosUniversityAcademicState {
  const nowMs = now.getTime()
  const subjectEvidence: CosUniversityAssessmentEvidence[] = []
  const languageEvidence: CosPlatformLanguageAssessmentEvidence[] = []

  for (const row of rows) {
    if (!gradeEligible(row, nowMs)) continue
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
    subjectTranscript: buildCosUniversityTranscript(subjectEvidence),
    languageTranscript: buildCosPlatformLanguageTranscript(languageEvidence),
    assessmentRows: rows.length,
    semantics: 'fresh_independent_assessment_evidence_only',
  }
}
