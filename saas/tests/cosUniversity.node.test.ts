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

test('self-scored or stale assessment evidence cannot raise a grade', () => {
  const selfScored = deriveCosUniversityGrade('reasoning_decision_science', [
    assessment('unseen_subject_exam', true, { independentScorer: false }),
  ])
  assert.equal(selfScored.grade, 'unassessed')

  const stale = deriveCosUniversityGrade('reasoning_decision_science', [
    assessment('unseen_subject_exam', true, { fresh: false }),
  ])
  assert.equal(stale.grade, 'unassessed')
})

test('grades advance only through qualitatively stronger independent evidence', () => {
  const practice = [assessment('practice_checkpoint')]
  assert.equal(deriveCosUniversityGrade('reasoning_decision_science', practice).grade, 'C')

  const unseen = [...practice, assessment('unseen_subject_exam', true, { observedAt: observedAt(2) })]
  assert.equal(deriveCosUniversityGrade('reasoning_decision_science', unseen).grade, 'B')

  const transfer = [...unseen, assessment('cross_domain_transfer', true, { observedAt: observedAt(3) })]
  assert.equal(deriveCosUniversityGrade('reasoning_decision_science', transfer).grade, 'A-')

  const production = [...transfer, assessment('production_transfer', true, { observedAt: observedAt(4) })]
  assert.equal(deriveCosUniversityGrade('reasoning_decision_science', production).grade, 'A')

  const capstone = [...production, assessment('capstone', true, { observedAt: observedAt(5) })]
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
    assessment('production_transfer', true, { subjectId: 'cybersecurity', observedAt: observedAt(4) }),
  ])

  const target = selectNextCosUniversityStudyTarget({
    transcript,
    signals: [{ sourceSubject: 'security incident response', attempts: 8, productionFailures: 1 }],
  })

  assert.equal(target?.subjectId, 'cybersecurity')
  assert.equal(target?.currentGrade, 'A')
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

test('with no failure signal, continuing education starts from the first subject below target grade', () => {
  const target = selectNextCosUniversityStudyTarget({ transcript: buildCosUniversityTranscript([]) })
  assert.equal(target?.subjectId, 'computer_science')
  assert.equal(target?.currentGrade, 'unassessed')
  assert.ok(target?.reasons.includes('academic_gap=unassessed->A'))
})
