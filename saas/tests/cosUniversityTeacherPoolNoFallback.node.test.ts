import test from 'node:test'
import assert from 'node:assert/strict'
import { selectUniversityTeacher } from '../lib/ai/cos/cosUniversityTeacherPool.ts'

test('teacher selection returns null instead of silently falling back', () => {
  const teacher = selectUniversityTeacher({
    routingKey: 'enterprise:none',
    env: {
      COS_UNIVERSITY_TEACHER_OPENAI_ENABLED: 'true',
      OPENAI_API_KEY: '',
    },
  })
  assert.equal(teacher, null)
})
