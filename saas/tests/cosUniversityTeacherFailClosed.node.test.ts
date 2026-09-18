import test from 'node:test'
import assert from 'node:assert/strict'
import { selectUniversityTeacher } from '../lib/ai/cos/cosUniversityTeacherPool.ts'

test('no configured teacher returns no teacher', () => {
  assert.equal(selectUniversityTeacher({ routingKey: 'none', env: {} }), null)
})
