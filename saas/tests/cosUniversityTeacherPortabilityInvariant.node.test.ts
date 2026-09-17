import test from 'node:test'
import assert from 'node:assert/strict'
import { COS_UNIVERSITY_TEACHER_PORTABILITY_INVARIANT } from '../lib/ai/cos/cosUniversityTeacherPoolReadmeGuard.ts'

test('teacher portability invariant stays buyer-owned and fail-closed', () => {
  assert.deepEqual(COS_UNIVERSITY_TEACHER_PORTABILITY_INVARIANT, {
    buyerOwnedCredentials: true,
    providerLockIn: false,
    silentFallbackAllowed: false,
    providerSelectionIsConfiguration: true,
    authorityExpanded: false,
  })
})
