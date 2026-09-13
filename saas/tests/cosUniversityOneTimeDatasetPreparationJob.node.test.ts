import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeHuggingFaceDatasetRef } from '../lib/ai/cos/cosUniversityHuggingFaceJobs.ts'

test('registered teacher dataset reference is immutable and decodable', () => {
  const ref = 'hf://datasets/cadomos/itmounts-teacher-ad060d19ee47@60b4d9994c661c3a125c67c4947497e67c1369bf#train'
  const decoded = decodeHuggingFaceDatasetRef(ref)
  assert.equal(decoded?.repoId, 'cadomos/itmounts-teacher-ad060d19ee47')
  assert.equal(decoded?.revision, '60b4d9994c661c3a125c67c4947497e67c1369bf')
  assert.equal(decoded?.split, 'train')
})
