import test from 'node:test'
import assert from 'node:assert/strict'
import { UNIVERSITY_TEACHERS } from '../lib/ai/cos/cosUniversityTeacherPool.ts'

test('custom adapter keeps future enterprise providers pluggable', () => {
  assert.ok(UNIVERSITY_TEACHERS.some(item => item.id === 'custom' && item.transport === 'custom_adapter'))
})
