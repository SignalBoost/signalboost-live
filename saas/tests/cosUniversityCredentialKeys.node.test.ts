import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COS_UNIVERSITY_GENERALIST_UNDERGRADUATE_CREDENTIAL_KEY,
  cosUniversityGeneralistUndergraduateCredentialKey,
} from '../lib/ai/cos/cosUniversityCredentials.ts'

test('COS keeps its historical undergraduate credential key', () => {
  assert.equal(cosUniversityGeneralistUndergraduateCredentialKey('cos'), COS_UNIVERSITY_GENERALIST_UNDERGRADUATE_CREDENTIAL_KEY)
})

test('every other agent receives a distinct agent-scoped undergraduate credential key', () => {
  const specialist = cosUniversityGeneralistUndergraduateCredentialKey('software-specialist')
  assert.equal(specialist, 'software-specialist:generalist_undergraduate:v1')
  assert.notEqual(specialist, COS_UNIVERSITY_GENERALIST_UNDERGRADUATE_CREDENTIAL_KEY)
  assert.notEqual(cosUniversityGeneralistUndergraduateCredentialKey('cybersecurity-specialist'), specialist)
  assert.throws(() => cosUniversityGeneralistUndergraduateCredentialKey('  '), /agent_id_required/)
})
