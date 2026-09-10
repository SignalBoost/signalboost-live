import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COS_UNIVERSITY_SUBJECTS,
  buildCosUniversityTranscript,
  classifyCosUniversitySubjects,
  cosUniversityEvidenceLines,
  deriveCosUniversityGrade,
  selectNextCosUniversityStudyTarget,
  type CosUniversityAssessmentEvidence,
} from '../lib/ai/cos/cosUniversity.ts'
import {
  COS_PLATFORM_LANGUAGES,
  buildCosPlatformLanguageTranscript,
  deriveCosPlatformLanguageGrade,
  platformLanguageGraduationReady,
  weakestPlatformLanguage,
  type CosPlatformLanguage,
  type CosPlatformLanguageAssessmentEvidence,
  type CosPlatformLanguageDimension,
} from '../lib/ai/cos/cosUniversityLanguages.ts'

const observedAt = (minute: number) => new Date(Date.UTC(2026, 8, 7, 12, minute, 0)).toISOString()

function assessment(
  kind: CosUniversityAssessmentEvidence['kind'],
  passed = true,
  overrides: Partial<CosUniversityAssessmentEvidence> = {},
): CosUniversityAssessmentEvidence {
  return {
    assessmentId: `assessment-${kind}-${overrides.observedAt || '1'}`,
    subjectId: 'reasoning_decision_science',
    kind,
    passed,
    independentScorer: true,
    fresh: true,
    scorerVersion: 'host-scorer-v1',
    observedAt: observedAt(1),
    ...overrides,
  }
}

const LANGUAGE_DIMENSIONS: CosPlatformLanguageDimension[] = [
  'comprehension',
  'writing',
  'instruction_following',
  'translation_localization',
  'cultural_pragmatics',
]

function languageStage(
  language: CosPlatformLanguage,
  kind: CosPlatformLanguageAssessmentEvidence['kind'],
  minute: number,
): CosPlatformLanguageAssessmentEvidence[] {
  return LANGUAGE_DIMENSIONS.map((dimension, index) => ({
    assessmentId: `${language}-${kind}-${dimension}`,
    language,
    dimension,
    kind,
    passed: true,
    independentScorer: true,
    fresh: true,
    scorerVersion: 'language-host-scorer-v1',
    observedAt: observedAt(minute + index),
  }))
}

test('COS University exposes a stable unique thirteen-subject core', () => {
  assert.equal(COS_UNIVERSITY_SUBJECTS.length, 13)
  assert.equal(new Set(COS_UNIVERSITY_SUBJECTS.map(subject => subject.id)).size, COS_UNIVERSITY_SUBJECTS.length)
  assert.ok(COS_UNIVERSITY_SUBJECTS.every(subject => subject.studyThemes.length >= 4))
})

test('real work can classify into multiple university subjects without forcing a false single label', () => {
  const latency = classifyCosUniversitySubjects('Debug a TypeScript API latency regression where p99 diverges from p50 using evidence and falsifiers.')
  assert.ok(latency.includes('computer_science'))
  assert.ok(latency.includes('statistics_data_science'))
  assert.ok(latency.includes('reasoning_decision_science'))

  const procurement = classifyCosUniversitySubjects('Review a GDPR procurement contract and compliance questionnaire for a commercial customer.')
  assert.ok(procurement.includes('law_regulation_governance'))
  assert.ok(procurement.includes('business_operations'))

  const diplomacy = classifyCosUniversitySubjects('Assess diplomatic options and geopolitical public-policy consequences.')
  assert.ok(diplomacy.includes('politics_government_international_relations'))
})

test('academic evidence tags can travel with existing learning gaps without claiming a grade', () => {
  const lines = cosUniversityEvidenceLines('software debugging and statistical inference')
  assert.ok(lines.includes('university_subject=computer_science'))
  assert.ok(lines.includes('university_subject=statistics_data_science'))
  assert.ok(lines.every(line => !line.includes('grade=')))
})

test('study volume cannot manufacture a university grade', () => {
  const entry = deriveCosUniversityGrade('computer_science', [])
  assert.equal(entry.grade, 'unassessed')
  assert.equal(entry.evidenceCount, 0)

  const transcript = buildCosUniversityTranscript([])
  assert.equal(transcript.length, 13)
  assert.ok(transcript.every(subject => subject.grade === 'unassessed'))
})

test('self-scored stale or malformed-dated assessment evidence cannot raise a grade', () => {
  const selfScored = deriveCosUniversityGrade('reasoning_decision_science', [
    assessment('unseen_subject_exam', true, { independentScorer: false }),
  ])
  assert.equal(selfScored.grade, 'unassessed')

  const stale = deriveCosUniversityGrade('reasoning_decision_science', [
    assessment('unseen_subject_exam', true, { fresh: false }),
  ])
  assert.equal(stale.grade, 'unassessed')

  const malformedDate = deriveCosUniversityGrade('reasoning_decision_science', [
    assessment('unseen_subject_exam', true, { observedAt: 'not-a-date' }),
  ])
  assert.equal(malformedDate.grade, 'unassessed')
})

test('grades advance only through qualitatively stronger independent evidence', () => {
  const practice = [assessment('practice_checkpoint')]
  assert.equal(deriveCosUniversityGrade('reasoning_decision_science', practice).grade, 'C')

  const unseen = [...practice, assessment('unseen_subject_exam', true, { observedAt: observedAt(2) })]
  assert.equal(deriveCosUniversityGrade('reasoning_decision_science', unseen).grade, 'B')

  const transfer = [...unseen, assessment('cross_domain_transfer', true, { observedAt: observedAt(3) })]
  assert.equal(deriveCosUniversityGrade('reasoning_decision_science', transfer).grade, 'A-')

  const withoutRetention = [...transfer, assessment('production_transfer', true, { observedAt: observedAt(4) })]
  assert.equal(deriveCosUniversityGrade('reasoning_decision_science', withoutRetention).grade, 'A-')

  const retained = [...transfer, assessment('delayed_retention', true, { observedAt: observedAt(4) })]
  assert.equal(deriveCosUniversityGrade('reasoning_decision_science', retained).grade, 'A-')

  const production = [...retained, assessment('production_transfer', true, { observedAt: observedAt(5) })]
  assert.equal(deriveCosUniversityGrade('reasoning_decision_science', production).grade, 'A')

  const capstone = [...production, assessment('capstone', true, { observedAt: observedAt(6) })]
  assert.equal(deriveCosUniversityGrade('reasoning_decision_science', capstone).grade, 'A+')
})

test('a later failed required stage revokes that stage until a newer independent retest passes', () => {
  const rows = [
    assessment('practice_checkpoint', true, { observedAt: observedAt(1) }),
    assessment('unseen_subject_exam', true, { observedAt: observedAt(2) }),
    assessment('unseen_subject_exam', false, { observedAt: observedAt(3) }),
  ]
  assert.equal(deriveCosUniversityGrade('reasoning_decision_science', rows).grade, 'C')

  rows.push(assessment('unseen_subject_exam', true, { observedAt: observedAt(4) }))
  assert.equal(deriveCosUniversityGrade('reasoning_decision_science', rows).grade, 'B')
})

test('failed independent diagnostic becomes remediation rather than a fabricated passing grade', () => {
  const failed = deriveCosUniversityGrade('reasoning_decision_science', [assessment('diagnostic', false)])
  assert.equal(failed.grade, 'F')
  assert.match(failed.reasons.join(' '), /diagnostic/i)
})

test('verified Production failure outranks passive academic coverage when choosing what to study next', () => {
  const transcript = buildCosUniversityTranscript([
    assessment('practice_checkpoint', true, { subjectId: 'cybersecurity' }),
    assessment('unseen_subject_exam', true, { subjectId: 'cybersecurity', observedAt: observedAt(2) }),
    assessment('cross_domain_transfer', true, { subjectId: 'cybersecurity', observedAt: observedAt(3) }),
    assessment('delayed_retention', true, { subjectId: 'cybersecurity', observedAt: observedAt(4) }),
    assessment('production_transfer', true, { subjectId: 'cybersecurity', observedAt: observedAt(5) }),
  ])

  const target = selectNextCosUniversityStudyTarget({
    transcript,
    signals: [{ sourceSubject: 'security incident response', attempts: 8, productionFailures: 1 }],
  })

  assert.equal(target?.subjectId, 'cybersecurity')
  assert.equal(target?.currentGrade, 'A')
  assert.equal(target?.targetGrade, 'A+')
  assert.ok(target?.reasons.includes('verified_production_failures=1'))
})

test('user corrections outrank negative feedback and external dependency in transparent study ordering', () => {
  const transcript = buildCosUniversityTranscript([])
  const target = selectNextCosUniversityStudyTarget({
    transcript,
    signals: [
      { sourceSubject: 'software architecture', attempts: 20, negativeFeedback: 3, externalDependencies: 3 },
      { sourceSubject: 'executive communication writing', attempts: 2, userCorrections: 1 },
    ],
  })
  assert.equal(target?.subjectId, 'language_communication')
  assert.ok(target?.reasons.includes('user_corrections=1'))
})

test('with no failure signal continuous machine education targets A+ by default', () => {
  const target = selectNextCosUniversityStudyTarget({ transcript: buildCosUniversityTranscript([]) })
  assert.equal(target?.subjectId, 'computer_science')
  assert.equal(target?.currentGrade, 'unassessed')
  assert.equal(target?.targetGrade, 'A+')
  assert.ok(target?.reasons.includes('academic_gap=unassessed->A+'))
})

test('SignalBoost platform languages are exactly English Spanish Portuguese Polish and Russian', () => {
  assert.deepEqual(COS_PLATFORM_LANGUAGES.map(language => language.id), ['en', 'es', 'pt', 'pl', 'ru'])
  assert.deepEqual(COS_PLATFORM_LANGUAGES.map(language => language.title), ['English', 'Spanish', 'Portuguese', 'Polish', 'Russian'])
  assert.ok(COS_PLATFORM_LANGUAGES.every(language => language.required))
})

test('each platform language is graded independently across five communication dimensions', () => {
  const englishOnly = [
    ...languageStage('en', 'practice_checkpoint', 10),
    ...languageStage('en', 'unseen_subject_exam', 20),
    ...languageStage('en', 'cross_domain_transfer', 30),
    ...languageStage('en', 'production_transfer', 40),
  ]
  assert.equal(deriveCosPlatformLanguageGrade('en', englishOnly).grade, 'A')
  assert.equal(deriveCosPlatformLanguageGrade('pl', englishOnly).grade, 'unassessed')
  assert.equal(platformLanguageGraduationReady(buildCosPlatformLanguageTranscript(englishOnly)), false)
})

test('one weak language dimension blocks the language from being averaged upward', () => {
  const polish = [
    ...languageStage('pl', 'practice_checkpoint', 10),
    ...languageStage('pl', 'unseen_subject_exam', 20),
  ]
  const writing = polish.find(row => row.kind === 'unseen_subject_exam' && row.dimension === 'writing')!
  writing.passed = false
  const entry = deriveCosPlatformLanguageGrade('pl', polish)
  assert.equal(entry.grade, 'C')
  assert.equal(entry.dimensionsPassed.includes('writing'), false)
})

test('five-language graduation readiness requires every platform language independently at target', () => {
  const evidence: CosPlatformLanguageAssessmentEvidence[] = []
  for (const language of COS_PLATFORM_LANGUAGES) {
    evidence.push(
      ...languageStage(language.id, 'practice_checkpoint', 10),
      ...languageStage(language.id, 'unseen_subject_exam', 20),
      ...languageStage(language.id, 'cross_domain_transfer', 30),
      ...languageStage(language.id, 'production_transfer', 40),
    )
  }
  const transcript = buildCosPlatformLanguageTranscript(evidence)
  assert.equal(platformLanguageGraduationReady(transcript, 'A'), true)
  assert.equal(platformLanguageGraduationReady(transcript, 'A+'), false)
  assert.equal(weakestPlatformLanguage(transcript)?.grade, 'A')
})
