import test from 'node:test'
import assert from 'node:assert/strict'
import {
  UNIVERSITY_TEACHERS,
  selectUniversityTeacher,
  universityTeacherPoolStatus,
  universityTeacherProvenance,
} from '../lib/ai/cos/cosUniversityTeacherPool.ts'

test('teacher pool registers enterprise providers without provider lock-in', () => {
  assert.deepEqual(UNIVERSITY_TEACHERS.map(item => item.id), ['qwen', 'deepseek', 'openai', 'claude', 'grok', 'custom'])
  assert.ok(UNIVERSITY_TEACHERS.every(item => item.buyerOwnedCredential))
  assert.ok(UNIVERSITY_TEACHERS.every(item => item.provenanceRequired))
  assert.ok(UNIVERSITY_TEACHERS.every(item => item.costCeilingRequired))
  assert.ok(UNIVERSITY_TEACHERS.every(item => item.silentFallbackAllowed === false))
})

test('providers fail closed unless explicitly enabled, credentialed and adapter-ready', () => {
  const env = {
    HF_TOKEN: 'hf_123456789012345678901234567890',
    OPENAI_API_KEY: 'sk_123456789012345678901234567890',
    COS_UNIVERSITY_TEACHER_QWEN_ENABLED: 'true',
    COS_UNIVERSITY_TEACHER_OPENAI_ENABLED: 'true',
  }
  const status = universityTeacherPoolStatus(env)
  assert.deepEqual(status.activeProviders.map(item => item.id), ['qwen'])
  assert.equal(status.providerLockIn, false)
  assert.equal(status.silentFallbackAllowed, false)
})

test('hosted provider becomes eligible only when its explicit adapter gate is ready', () => {
  const env = {
    OPENAI_API_KEY: 'sk_123456789012345678901234567890',
    COS_UNIVERSITY_TEACHER_OPENAI_ENABLED: 'true',
    COS_UNIVERSITY_TEACHER_OPENAI_ADAPTER_READY: 'true',
    COS_UNIVERSITY_TEACHER_OPENAI_MODEL: 'gpt-5.6-luna',
  }
  assert.deepEqual(universityTeacherPoolStatus(env).activeProviders.map(item => item.id), ['openai'])
})

test('hosted provider stays inactive when model configuration is missing', () => {
  const env = {
    OPENAI_API_KEY: 'sk_123456789012345678901234567890',
    COS_UNIVERSITY_TEACHER_OPENAI_ENABLED: 'true',
    COS_UNIVERSITY_TEACHER_OPENAI_ADAPTER_READY: 'true',
  }
  const status = universityTeacherPoolStatus(env)
  const openai = status.providers.find(item => item.id === 'openai')
  assert.equal(openai?.credentialReady, true)
  assert.equal(openai?.adapterReady, true)
  assert.equal(openai?.modelReady, false)
  assert.equal(openai?.active, false)
})

test('teacher selection is deterministic and preserves provenance', () => {
  const env = {
    HF_TOKEN: 'hf_123456789012345678901234567890',
    COS_UNIVERSITY_TEACHER_QWEN_ENABLED: 'true',
    COS_UNIVERSITY_TEACHER_DEEPSEEK_ENABLED: 'true',
  }
  const a = selectUniversityTeacher({ routingKey: 'batch:abc', allowedTransports: ['huggingface_job'], env })
  const b = selectUniversityTeacher({ routingKey: 'batch:abc', allowedTransports: ['huggingface_job'], env })
  assert.ok(a)
  assert.equal(a?.id, b?.id)
  assert.ok(['qwen', 'deepseek'].includes(a?.id || ''))
  const provenance = universityTeacherProvenance({ teacher: a!, routingKey: 'batch:abc', modelRevision: 'rev-1' })
  assert.equal(provenance.teacherId, a?.id)
  assert.equal(provenance.buyerOwnedCredential, true)
  assert.equal(provenance.silentFallbackAllowed, false)
  assert.equal(provenance.authorityExpanded, false)
})
