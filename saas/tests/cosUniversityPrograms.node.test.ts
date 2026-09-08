import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  COS_UNIVERSITY_PROGRAMS,
  buildCosUniversityProgramEnrollment,
  cosUniversityProgramMayGraduate,
  cosUniversityProgramTimingStatus,
} from '../lib/ai/cos/cosUniversityPrograms.ts'
import { applyCosUniversityUndergraduateCalendar } from '../lib/ai/cos/cosUniversityProgramGate.ts'
import type { CosUniversityGeneralistGraduationStatus } from '../lib/ai/cos/cosUniversityGraduation.ts'
import type { CosUniversityCredential } from '../lib/ai/cos/cosUniversityCredentials.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

const academicallyGraduated: CosUniversityGeneralistGraduationStatus = {
  graduated: true,
  standing: 'A',
  prerequisitesReady: true,
  advancedLearningEligible: true,
  qualification: 'advanced_learning_eligible',
  continuingEducationRequired: true,
  authorityExpanded: false,
  subjectBlockers: [],
  languageBlockers: [],
  capstone: { passed: true, requiredDistinctPasses: 2, distinctPassesSinceLatestFailure: 2 },
  semantics: 'derived_fresh_evidence_no_permanent_diploma',
}

const credential: CosUniversityCredential = {
  credentialKey: 'cos_generalist_undergraduate_v1',
  programKey: 'generalist_undergraduate_v1',
  programLevel: 'undergraduate',
  title: 'COS University Generalist Undergraduate Credential',
  standing: 'A',
  awardedAt: '2026-12-01T00:00:00.000Z',
}

test('AI degree programs have explicit bounded calendars rather than indefinite enrollment', () => {
  assert.deepEqual(COS_UNIVERSITY_PROGRAMS.undergraduate, {
    level: 'undergraduate', title: 'Generalist Undergraduate Program', minimumResidenceDays: 60, targetCompletionDays: 120, hardDeadlineDays: 180,
  })
  assert.deepEqual(COS_UNIVERSITY_PROGRAMS.masters, {
    level: 'masters', title: 'Specialist Master’s Program', minimumResidenceDays: 45, targetCompletionDays: 90, hardDeadlineDays: 180,
  })
  assert.deepEqual(COS_UNIVERSITY_PROGRAMS.phd, {
    level: 'phd', title: 'Research PhD Program', minimumResidenceDays: 180, targetCompletionDays: 365, hardDeadlineDays: 730,
  })
  assert.deepEqual(COS_UNIVERSITY_PROGRAMS.professional_certificate, {
    level: 'professional_certificate', title: 'Professional Certificate Program', minimumResidenceDays: 7, targetCompletionDays: 30, hardDeadlineDays: 90,
  })
})

test('undergraduate enrollment produces a real start, earliest graduation, target, and hard deadline', () => {
  const enrollment = buildCosUniversityProgramEnrollment({
    programKey: 'generalist_undergraduate_v1', level: 'undergraduate', enrolledAt: new Date('2026-09-08T07:00:00Z'),
  })
  assert.equal(enrollment.enrolledAt, '2026-09-08T07:00:00.000Z')
  assert.equal(enrollment.minimumResidenceUntil, '2026-11-07T07:00:00.000Z')
  assert.equal(enrollment.targetCompletionAt, '2027-01-06T07:00:00.000Z')
  assert.equal(enrollment.hardDeadlineAt, '2027-03-07T07:00:00.000Z')
})

test('calendar blocks instant graduation and ends an uncompleted cohort after its hard deadline', () => {
  const enrollment = buildCosUniversityProgramEnrollment({
    programKey: 'generalist_undergraduate_v1', level: 'undergraduate', enrolledAt: new Date('2026-09-08T07:00:00Z'),
  })
  assert.equal(cosUniversityProgramTimingStatus(enrollment, new Date('2026-10-01T00:00:00Z')), 'minimum_residence')
  assert.equal(cosUniversityProgramMayGraduate(enrollment, new Date('2026-10-01T00:00:00Z')), false)
  assert.equal(cosUniversityProgramTimingStatus(enrollment, new Date('2026-12-01T00:00:00Z')), 'on_schedule')
  assert.equal(cosUniversityProgramMayGraduate(enrollment, new Date('2026-12-01T00:00:00Z')), true)
  assert.equal(cosUniversityProgramTimingStatus(enrollment, new Date('2027-02-01T00:00:00Z')), 'target_date_passed')
  assert.equal(cosUniversityProgramTimingStatus(enrollment, new Date('2027-04-01T00:00:00Z')), 'deadline_expired')
  assert.equal(cosUniversityProgramMayGraduate(enrollment, new Date('2027-04-01T00:00:00Z')), false)
})

test('academic competence creates award eligibility inside the window but does not become a degree until host credential issuance', () => {
  const enrollment = buildCosUniversityProgramEnrollment({
    programKey: 'generalist_undergraduate_v1', level: 'undergraduate', enrolledAt: new Date('2026-09-08T07:00:00Z'),
  })
  const tooEarly = applyCosUniversityUndergraduateCalendar({ academicStatus: academicallyGraduated, enrollment, now: new Date('2026-10-01T00:00:00Z') })
  assert.equal(tooEarly.graduated, false)
  assert.equal(tooEarly.awardEligible, false)
  assert.equal(tooEarly.program.timingStatus, 'minimum_residence')

  const eligible = applyCosUniversityUndergraduateCalendar({ academicStatus: academicallyGraduated, enrollment, now: new Date('2026-12-01T00:00:00Z') })
  assert.equal(eligible.graduated, false)
  assert.equal(eligible.awardEligible, true)
  assert.equal(eligible.currentCompetenceStanding, 'A')

  const expiredWithoutAward = applyCosUniversityUndergraduateCalendar({ academicStatus: academicallyGraduated, enrollment, now: new Date('2027-04-01T00:00:00Z') })
  assert.equal(expiredWithoutAward.graduated, false)
  assert.equal(expiredWithoutAward.awardEligible, false)
  assert.equal(expiredWithoutAward.program.deadlineExpired, true)
})

test('once host-issued, a degree remains awarded after the cohort deadline while current competence stays separate', () => {
  const enrollment = buildCosUniversityProgramEnrollment({
    programKey: 'generalist_undergraduate_v1', level: 'undergraduate', enrolledAt: new Date('2026-09-08T07:00:00Z'),
  })
  const later = applyCosUniversityUndergraduateCalendar({
    academicStatus: { ...academicallyGraduated, graduated: false, standing: 'not_graduated', advancedLearningEligible: false, qualification: 'undergraduate_in_progress' },
    enrollment,
    credential,
    now: new Date('2027-09-01T00:00:00Z'),
  })
  assert.equal(later.graduated, true)
  assert.equal(later.standing, 'A')
  assert.equal(later.program.timingStatus, 'graduated')
  assert.equal(later.program.deadlineExpired, false)
  assert.equal(later.currentCompetenceStanding, 'not_graduated')
  assert.equal(later.advancedLearningEligible, true)
})

test('enrollment ledger is service-only and bootstraps COS from the first real University assessment', () => {
  const schema = file('supabase/migrations/20260908154500_cos_university_program_enrollments.sql')
  assert.match(schema, /program_level in \('undergraduate','masters','phd','professional_certificate'\)/i)
  assert.match(schema, /minimum_residence_until/i)
  assert.match(schema, /target_completion_at/i)
  assert.match(schema, /hard_deadline_at/i)
  assert.match(schema, /select min\(observed_at\) from public\.cos_university_assessments/i)
  assert.match(schema, /interval '60 days'/i)
  assert.match(schema, /interval '120 days'/i)
  assert.match(schema, /interval '180 days'/i)
  assert.match(schema, /enable row level security/i)
  assert.match(schema, /revoke all on table public\.cos_university_program_enrollments from anon, authenticated/i)
})

test('degree credential ledger is immutable, host-issued, and separate from current competency assessment', () => {
  const schema = file('supabase/migrations/20260908155000_cos_university_credentials.sql')
  assert.match(schema, /create table if not exists public\.cos_university_credentials/i)
  assert.match(schema, /revoke all on table public\.cos_university_credentials from anon, authenticated, service_role/i)
  assert.match(schema, /grant select, insert on table public\.cos_university_credentials to service_role/i)
  assert.match(schema, /before update or delete on public\.cos_university_credentials/i)
  assert.match(schema, /credentials are immutable/i)
  assert.doesNotMatch(schema, /valid_until/i)
})

test('graduation runtime checks enrollment/residence/deadline and host-issues a credential only from award-eligible evidence', () => {
  const runner = file('lib/ai/cos/cosUniversityGraduationRunner.ts')
  assert.match(runner, /cos_university_program_enrollments/)
  assert.match(runner, /cos_university_credentials/)
  assert.match(runner, /undergraduate_program_not_enrolled/)
  assert.match(runner, /undergraduate_program_deadline_expired/)
  assert.match(runner, /minimum_residence_incomplete/)
  assert.match(runner, /awardEligible/)
  assert.match(runner, /awardUndergraduateCredential/)
  assert.match(runner, /issuedBy: 'host_graduation_gate'/)
  assert.match(runner, /time_bounded_degree_credential_current_competence_separate/)
})
