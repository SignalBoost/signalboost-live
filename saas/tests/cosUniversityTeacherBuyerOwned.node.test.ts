import test from 'node:test'
import assert from 'node:assert/strict'
import { UNIVERSITY_TEACHERS } from '../lib/ai/cos/cosUniversityTeacherPool.ts'

test('all teacher definitions require buyer-owned credentials', () => {
  assert.ok(UNIVERSITY_TEACHERS.every(item => item.buyerOwnedCredential === true))
})
