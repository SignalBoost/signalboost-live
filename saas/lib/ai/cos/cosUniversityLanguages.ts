import type { CosUniversityAssessmentKind, CosUniversityGrade } from './cosUniversity.ts'

/** The five first-class SignalBoost platform languages. */
export type CosPlatformLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type CosPlatformLanguageDefinition = {
  id: CosPlatformLanguage
  title: string
  required: true
  competencyDimensions: readonly [
    'comprehension',
    'writing',
    'instruction_following',
    'translation_localization',
    'cultural_pragmatics',
  ]
}

const LANGUAGE_DIMENSIONS = [
  'comprehension',
  'writing',
  'instruction_following',
  'translation_localization',
  'cultural_pragmatics',
] as const

export const COS_PLATFORM_LANGUAGES: ReadonlyArray<CosPlatformLanguageDefinition> = [
  { id: 'en', title: 'English', required: true, competencyDimensions: LANGUAGE_DIMENSIONS },
  { id: 'es', title: 'Spanish', required: true, competencyDimensions: LANGUAGE_DIMENSIONS },
  { id: 'pt', title: 'Portuguese', required: true, competencyDimensions: LANGUAGE_DIMENSIONS },
  { id: 'pl', title: 'Polish', required: true, competencyDimensions: LANGUAGE_DIMENSIONS },
  { id: 'ru', title: 'Russian', required: true, competencyDimensions: LANGUAGE_DIMENSIONS },
]

export type CosPlatformLanguageDimension = typeof LANGUAGE_DIMENSIONS[number]

export type CosPlatformLanguageAssessmentEvidence = {
  assessmentId: string
  language: CosPlatformLanguage
  dimension: CosPlatformLanguageDimension
  kind: CosUniversityAssessmentKind
  passed: boolean
  independentScorer: boolean
  fresh: boolean
  scorerVersion: string
  observedAt: string
}

export type CosPlatformLanguageTranscriptEntry = {
  language: CosPlatformLanguage
  title: string
  grade: CosUniversityGrade
  evidenceCount: number
  dimensionsPassed: CosPlatformLanguageDimension[]
  latestAssessmentAt: string | null
  reasons: string[]
}

const GRADE_RANK: Record<CosUniversityGrade, number> = {
  unassessed: -1,
  F: 0,
  D: 1,
  C: 2,
  B: 3,
  'A-': 4,
  A: 5,
  'A+': 6,
}

function valid(row: CosPlatformLanguageAssessmentEvidence): boolean {
  return Boolean(
    String(row.assessmentId || '').trim()
    && String(row.scorerVersion || '').trim()
    && row.independentScorer === true
    && row.fresh === true,
  )
}

function latest(
  rows: CosPlatformLanguageAssessmentEvidence[],
  kind: CosUniversityAssessmentKind,
  dimension?: CosPlatformLanguageDimension,
): CosPlatformLanguageAssessmentEvidence | null {
  return rows
    .filter(row => row.kind === kind && (!dimension || row.dimension === dimension))
    .slice()
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0] ?? null
}

function allDimensionsPass(
  rows: CosPlatformLanguageAssessmentEvidence[],
  kind: CosUniversityAssessmentKind,
): boolean {
  return LANGUAGE_DIMENSIONS.every(dimension => latest(rows, kind, dimension)?.passed === true)
}

/**
 * A language is not averaged from the other four languages, and one strong dimension cannot hide a
 * weak one. B or higher requires a fresh independent unseen exam in every language dimension.
 * A-range grades then require transfer/Production/capstone evidence for that same language.
 */
export function deriveCosPlatformLanguageGrade(
  language: CosPlatformLanguage,
  evidence: CosPlatformLanguageAssessmentEvidence[],
): CosPlatformLanguageTranscriptEntry {
  const definition = COS_PLATFORM_LANGUAGES.find(item => item.id === language)
  if (!definition) throw new Error(`Unknown SignalBoost language: ${language}`)
  const rows = evidence.filter(row => row.language === language && valid(row))
  const latestMs = rows.map(row => Date.parse(row.observedAt)).filter(Number.isFinite).sort((a, b) => b - a)[0]
  const latestAssessmentAt = Number.isFinite(latestMs) ? new Date(latestMs as number).toISOString() : null
  const dimensionsPassed = LANGUAGE_DIMENSIONS.filter(dimension => latest(rows, 'unseen_subject_exam', dimension)?.passed === true)

  if (!rows.length) {
    return {
      language,
      title: definition.title,
      grade: 'unassessed',
      evidenceCount: 0,
      dimensionsPassed: [],
      latestAssessmentAt: null,
      reasons: ['No fresh independent language assessment evidence.'],
    }
  }

  const practice = allDimensionsPass(rows, 'practice_checkpoint')
  const unseen = allDimensionsPass(rows, 'unseen_subject_exam')
  const transfer = unseen && allDimensionsPass(rows, 'cross_domain_transfer')
  const production = transfer && allDimensionsPass(rows, 'production_transfer')
  const capstone = production && allDimensionsPass(rows, 'capstone')

  let grade: CosUniversityGrade
  let reason: string
  if (capstone) {
    grade = 'A+'
    reason = 'All five language dimensions passed fresh independent unseen, transfer, Production, and capstone stages.'
  } else if (production) {
    grade = 'A'
    reason = 'All five language dimensions passed fresh independent unseen, cross-domain transfer, and Production transfer stages.'
  } else if (transfer) {
    grade = 'A-'
    reason = 'All five language dimensions passed unseen and cross-domain transfer stages; Production transfer is not yet complete.'
  } else if (unseen) {
    grade = 'B'
    reason = 'All five language dimensions passed fresh independent unseen exams; stronger transfer evidence is not yet complete.'
  } else if (practice) {
    grade = 'C'
    reason = 'All five language dimensions passed practice checkpoints; unseen examination is not yet complete.'
  } else {
    const diagnosticFailure = rows.some(row => row.kind === 'diagnostic' && row.passed === false)
    grade = diagnosticFailure ? 'F' : 'D'
    reason = diagnosticFailure
      ? 'A fresh independent language diagnostic exposed a weakness requiring remediation.'
      : 'Language evidence exists, but not every required dimension has passed the practice checkpoint.'
  }

  return { language, title: definition.title, grade, evidenceCount: rows.length, dimensionsPassed, latestAssessmentAt, reasons: [reason] }
}

export function buildCosPlatformLanguageTranscript(
  evidence: CosPlatformLanguageAssessmentEvidence[],
): CosPlatformLanguageTranscriptEntry[] {
  return COS_PLATFORM_LANGUAGES.map(language => deriveCosPlatformLanguageGrade(language.id, evidence))
}

/** No averaging: every one of EN/ES/PT/PL/RU must independently satisfy the target. */
export function platformLanguageGraduationReady(
  transcript: CosPlatformLanguageTranscriptEntry[],
  target: 'A' | 'A+' = 'A',
): boolean {
  const byLanguage = new Map(transcript.map(entry => [entry.language, entry] as const))
  return COS_PLATFORM_LANGUAGES.every(language => {
    const entry = byLanguage.get(language.id)
    return Boolean(entry && GRADE_RANK[entry.grade] >= GRADE_RANK[target])
  })
}

export function weakestPlatformLanguage(
  transcript: CosPlatformLanguageTranscriptEntry[],
): CosPlatformLanguageTranscriptEntry | null {
  return transcript.slice().sort((a, b) => GRADE_RANK[a.grade] - GRADE_RANK[b.grade] || a.language.localeCompare(b.language))[0] ?? null
}
