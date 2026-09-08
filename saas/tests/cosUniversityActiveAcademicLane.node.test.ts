// saas/tests/cosUniversityActiveAcademicLane.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateCosUniversityActiveAcademicLane } from '../lib/ai/cos/cosUniversityProgramGate.ts'
import { buildCosUniversityProgramEnrollment } from '../lib/ai/cos/cosUniversityPrograms.ts'

const undergraduate = buildCosUniversityProgramEnrollment({
  programKey: 'generalist_undergraduate_v1',
  level: 'undergraduate',
  enrolledAt: new Date('2026-09-08T00:00:00Z'),
})

const masters = buildCosUniversityProgramEnrollment({
  programKey: 'specialist_masters_security_and_trust_v1',
  level: 'masters',
  enrolledAt: new Date('2027-02-01T00:00:00Z'),
})

test('a live undergraduate cohort keeps academic lanes open even with no other program', () => {
  const gate = evaluateCosUniversityActiveAcademicLane({
    enrollments: [undergraduate],
    now: new Date('2026-10-01T00:00:00Z'),
  })
  assert.equal(gate.allowed, true)
  assert.equal(gate.programKey, 'generalist_undergraduate_v1')
  assert.equal(gate.reason, 'active_undergraduate_program')
})

test('undergraduate credential issued but Master\'s cohort still live: lanes stay open under the new program', () => {
  const gate = evaluateCosUniversityActiveAcademicLane({
    enrollments: [undergraduate, masters],
    completedProgramKeys: ['generalist_undergraduate_v1'],
    now: new Date('2027-03-01T00:00:00Z'),
  })
  assert.equal(gate.allowed, true)
  assert.equal(gate.programKey, 'specialist_masters_security_and_trust_v1')
  assert.equal(gate.reason, 'active_academic_program')
})

test('every held program is finished or expired: lanes stop, reports no active program', () => {
  const gate = evaluateCosUniversityActiveAcademicLane({
    enrollments: [undergraduate],
    completedProgramKeys: ['generalist_undergraduate_v1'],
    now: new Date('2027-03-01T00:00:00Z'),
  })
  assert.equal(gate.allowed, false)
  assert.equal(gate.reason, 'no_active_academic_program')
})

test('no enrollment at all: lanes stop cleanly rather than throwing', () => {
  const gate = evaluateCosUniversityActiveAcademicLane({ enrollments: [], now: new Date('2027-03-01T00:00:00Z') })
  assert.equal(gate.allowed, false)
  assert.equal(gate.programKey, null)
})
