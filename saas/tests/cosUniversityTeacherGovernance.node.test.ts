import test from 'node:test'
import assert from 'node:assert/strict'
import { universityTeacherProvenance, UNIVERSITY_TEACHERS } from '../lib/ai/cos/cosUniversityTeacherPool.ts'

test('teacher provenance cannot expand authority', () => {
  const evidence = universityTeacherProvenance({ teacher: UNIVERSITY_TEACHERS[0], routingKey: 'x' })
  assert.equal(evidence.authorityExpanded, false)
})
