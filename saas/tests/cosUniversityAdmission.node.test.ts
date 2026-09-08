// saas/tests/cosUniversityAdmission.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { decideCosUniversityAdmission, COS_UNIVERSITY_UNDERGRADUATE_PROGRAM_KEY } from '../lib/ai/cos/cosUniversityAdmission.ts'
import { buildCosUniversityProgramEnrollment } from '../lib/ai/cos/cosUniversityPrograms.ts'
import type { CosUniversityCredential } from '../lib/ai/cos/cosUniversityCredentials.ts'
import type { CosUniversityTranscriptEntry } from '../lib/ai/cos/cosUniversity.ts'

const undergraduateEnrollment = buildCosUniversityProgramEnrollment({
  programKey: COS_UNIVERSITY_UNDERGRADUATE_PROGRAM_KEY,
  level: 'undergraduate',
  enrolledAt: new Date('2026-09-08T00:00:00Z'),
})

const undergraduateCredential: CosUniversityCredential = {
  credentialKey: 'cos_generalist_undergraduate_v1',
  programKey: COS_UNIVERSITY_UNDERGRADUATE_PROGRAM_KEY,
  programLevel: 'undergraduate',
  title: 'COS University Generalist Undergraduate Credential',
  standing: 'A',
  awardedAt: '2027-01-10T00:00:00.000Z',
}

const strongCybersecurityTranscript: CosUniversityTranscriptEntry[] = [
  { subjectId: 'cybersecurity', title: 'Cybersecurity', grade: 'A+', evidenceCount: 4, latestAssessmentAt: '2027-01-01T00:00:00.000Z', reasons: [] },
  { subjectId: 'computer_science', title: 'Computer Science', grade: 'A', evidenceCount: 4, latestAssessmentAt: '2027-01-01T00:00:00.000Z', reasons: [] },
]

test('no undergraduate credential yet and no cohort at all: refuses, names the missing credential', () => {
  const decision = decideCosUniversityAdmission({
    enrollments: [],
    credentials: [],
    subjectTranscript: [],
    now: new Date('2027-02-01T00:00:00Z'),
  })
  assert.equal(decision.admit, false)
  if (!decision.admit) assert.equal(decision.reason, 'undergraduate_credential_not_issued')
})

test('undergraduate cohort still active, no credential yet: refuses as active, never opens a second program', () => {
  const decision = decideCosUniversityAdmission({
    enrollments: [undergraduateEnrollment],
    credentials: [],
    subjectTranscript: [],
    now: new Date('2026-10-01T00:00:00Z'),
  })
  assert.equal(decision.admit, false)
  if (!decision.admit) assert.equal(decision.reason, 'undergraduate_program_active')
})

test('undergraduate cohort expired with no credential: refuses re-entry, does not launder failure into Master\'s', () => {
  const decision = decideCosUniversityAdmission({
    enrollments: [undergraduateEnrollment],
    credentials: [],
    subjectTranscript: strongCybersecurityTranscript,
    now: new Date('2027-04-01T00:00:00Z'),
  })
  assert.equal(decision.admit, false)
  if (!decision.admit) assert.equal(decision.reason, 'undergraduate_cohort_expired_without_credential')
})

test('undergraduate credential issued and no Master\'s yet: admits into the strongest-matching track', () => {
  const decision = decideCosUniversityAdmission({
    enrollments: [undergraduateEnrollment],
    credentials: [undergraduateCredential],
    subjectTranscript: strongCybersecurityTranscript,
    now: new Date('2027-02-01T00:00:00Z'),
  })
  assert.equal(decision.admit, true)
  if (decision.admit) {
    assert.equal(decision.trackId, 'security_and_trust')
    assert.equal(decision.programKey, 'specialist_masters_security_and_trust_v1')
    assert.equal(decision.programLevel, 'masters')
    assert.equal(decision.enrollment.programKey, decision.programKey)
  }
})

test('undergraduate credential issued but no positive subject standing anywhere: refuses, no track fits', () => {
  const decision = decideCosUniversityAdmission({
    enrollments: [undergraduateEnrollment],
    credentials: [undergraduateCredential],
    subjectTranscript: [],
    now: new Date('2027-02-01T00:00:00Z'),
  })
  assert.equal(decision.admit, false)
  if (!decision.admit) assert.equal(decision.reason, 'no_eligible_specialization')
})

test('already holds a Master\'s credential: refuses regardless of transcript', () => {
  const mastersCredential: CosUniversityCredential = {
    ...undergraduateCredential,
    credentialKey: 'cos_masters_security_and_trust_v1',
    programKey: 'specialist_masters_security_and_trust_v1',
    programLevel: 'masters',
  }
  const decision = decideCosUniversityAdmission({
    enrollments: [undergraduateEnrollment],
    credentials: [undergraduateCredential, mastersCredential],
    subjectTranscript: strongCybersecurityTranscript,
    now: new Date('2027-06-01T00:00:00Z'),
  })
  assert.equal(decision.admit, false)
  if (!decision.admit) assert.equal(decision.reason, 'already_enrolled_at_next_level')
})

test('already enrolled in a Master\'s program without a credential yet: refuses a second admission', () => {
  const mastersEnrollment = buildCosUniversityProgramEnrollment({
    programKey: 'specialist_masters_security_and_trust_v1',
    level: 'masters',
    enrolledAt: new Date('2027-02-01T00:00:00Z'),
  })
  const decision = decideCosUniversityAdmission({
    enrollments: [undergraduateEnrollment, mastersEnrollment],
    credentials: [undergraduateCredential],
    subjectTranscript: strongCybersecurityTranscript,
    now: new Date('2027-03-01T00:00:00Z'),
  })
  assert.equal(decision.admit, false)
  if (!decision.admit) assert.equal(decision.reason, 'already_enrolled_at_next_level')
})

test('admission never proposes extending the existing undergraduate enrollment dates', () => {
  const decision = decideCosUniversityAdmission({
    enrollments: [undergraduateEnrollment],
    credentials: [undergraduateCredential],
    subjectTranscript: strongCybersecurityTranscript,
    now: new Date('2027-02-01T00:00:00Z'),
  })
  assert.equal(decision.admit, true)
  if (decision.admit) {
    assert.notEqual(decision.enrollment.programKey, COS_UNIVERSITY_UNDERGRADUATE_PROGRAM_KEY)
    assert.equal(decision.enrollment.enrolledAt, new Date('2027-02-01T00:00:00Z').toISOString())
  }
})
