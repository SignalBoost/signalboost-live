import test from 'node:test'
import assert from 'node:assert/strict'
import { universityTeacherPoolStatus } from '../lib/ai/cos/cosUniversityTeacherPool.ts'

test('teacher pool reports no provider lock-in', () => {
  assert.equal(universityTeacherPoolStatus({}).providerLockIn, false)
})
