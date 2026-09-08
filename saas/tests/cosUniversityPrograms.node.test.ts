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

test('calendar blocks instant graduation and ends the cohort after its hard deadline', () => {
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

test('academic competence alone cannot graduate before residence or after cohort expiry', () => {
  const enrollment = buildCosUniversityProgramEnrollment({
    programKey: 'generalist_undergraduate_v1', level: 'undergraduate', enrolledAt: new Date('2026-09-08T07:00:00Z'),
  })
  const tooEarly = applyCosUniversityUndergraduateCalendar({ academicStatus: academicallyGraduated, enrollment, now: new Date('2026-10-01T00:00:00Z') })
  assert.equal(tooEarly.graduated, false)
  assert.equal(tooEarly.program.timingStatus, 'minimum_residence')
  const valid = applyCosUniversityUndergraduateCalendar({ academicStatus: academicallyGraduated, enrollment, now: new Date('2026-12-01T00:00:00Z') })
  assert.equal(valid.graduated, true)
  const expired = applyCosUniversityUndergraduateCalendar({ academicStatus: academicallyGraduated, enrollment, now: new Date('2027-04-01T00:00:00Z') })
  assert.equal(expired.graduated, false)
  assert.equal(expired.program.deadlineExpired, true)
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

test('graduation runtime checks enrollment, residence, and deadline before the capstone', () => {
  const runner = file('lib/ai/cos/cosUniversityGraduationRunner.ts')
  assert.match(runner, /cos_university_program_enrollments/)
  assert.match(runner, /undergraduate_program_not_enrolled/)
  assert.match(runner, /undergraduate_program_deadline_expired/)
  assert.match(runner, /minimum_residence_incomplete/)
  assert.match(runner, /applyCosUniversityUndergraduateCalendar/)
  assert.match(runner, /graduation_is_derived_revocable_and_time_bounded/)
})
