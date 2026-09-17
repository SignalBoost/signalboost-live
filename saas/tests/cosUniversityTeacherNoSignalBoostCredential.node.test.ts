import test from 'node:test'
import assert from 'node:assert/strict'
import { UNIVERSITY_TEACHERS } from '../lib/ai/cos/cosUniversityTeacherPool.ts'

test('teacher provider definitions do not reference SignalBoost-owned credentials', () => {
  assert.ok(UNIVERSITY_TEACHERS.every(item => !String(item.credentialEnv || '').includes('SIGNALBOOST')))
})
