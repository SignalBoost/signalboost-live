import test from 'node:test'
import assert from 'node:assert/strict'
import { universityTeacherLicenseAllowed, universityTeacherLicensePolicy } from '../lib/ai/cos/cosUniversityTeacherLicensePolicy.ts'

test('teacher license policy permits Apache-2.0 and MIT and fails closed on unknown licenses', () => {
  assert.equal(universityTeacherLicenseAllowed('apache-2.0'), true)
  assert.equal(universityTeacherLicenseAllowed('MIT'), true)
  assert.equal(universityTeacherLicenseAllowed('unknown'), false)
  assert.equal(universityTeacherLicenseAllowed(''), false)
  assert.equal(universityTeacherLicensePolicy().unknownLicenseAction, 'deny')
})
