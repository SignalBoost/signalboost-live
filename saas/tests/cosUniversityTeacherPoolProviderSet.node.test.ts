import test from 'node:test'
import assert from 'node:assert/strict'
import { UNIVERSITY_TEACHERS } from '../lib/ai/cos/cosUniversityTeacherPool.ts'

test('enterprise teacher set includes open, hosted and custom providers', () => {
  assert.deepEqual(new Set(UNIVERSITY_TEACHERS.map(item => item.provider)), new Set(['huggingface', 'openai', 'anthropic', 'xai', 'custom']))
})
