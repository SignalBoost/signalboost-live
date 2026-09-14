import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { graduateRuntimeConfigFromEnv, graduateRuntimeReadiness } from '../lib/ai/cos/cosUniversityGraduateRuntime.ts'

const ENV_KEYS = [
  'COS_GRADUATE_AI_BASE_URL',
  'COS_GRADUATE_AI_ALLOWED_HOSTS',
  'COS_GRADUATE_AI_PROVIDER',
  'COS_GRADUATE_AI_MODEL',
  'COS_GRADUATE_AI_ARTIFACT_ID',
  'COS_GRADUATE_AI_ARTIFACT_HASH',
  'COS_GRADUATE_AI_API_KEY',
  'HF_TOKEN',
] as const

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>, work: () => void) {
  const before = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))
  for (const key of ENV_KEYS) {
    const value = values[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try { work() } finally {
    for (const key of ENV_KEYS) {
      const value = before[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('graduate runtime requires exact artifact identity and exact allowed HTTPS host', () => {
  withEnv({
    COS_GRADUATE_AI_BASE_URL: 'https://graduate.example.com/v1',
    COS_GRADUATE_AI_ALLOWED_HOSTS: 'graduate.example.com',
    COS_GRADUATE_AI_PROVIDER: 'example-gpu',
    COS_GRADUATE_AI_MODEL: 'itmounts/reasoning-graduate',
    COS_GRADUATE_AI_ARTIFACT_ID: 'cadomos/itmounts-student-example',
    COS_GRADUATE_AI_ARTIFACT_HASH: 'a'.repeat(64),
    COS_GRADUATE_AI_API_KEY: 'test-secret-value-with-sufficient-length',
  }, () => {
    const config = graduateRuntimeConfigFromEnv()
    assert.equal(config?.artifactId, 'cadomos/itmounts-student-example')
    assert.equal(config?.artifactHash, 'a'.repeat(64))
    assert.equal(config?.model, 'itmounts/reasoning-graduate')
    assert.equal(config?.provider, 'example-gpu')
  })
})

test('graduate runtime refuses an unallowlisted remote endpoint', () => {
  withEnv({
    COS_GRADUATE_AI_BASE_URL: 'https://graduate.example.com/v1',
    COS_GRADUATE_AI_ALLOWED_HOSTS: 'different.example.com',
    COS_GRADUATE_AI_MODEL: 'itmounts/reasoning-graduate',
    COS_GRADUATE_AI_ARTIFACT_ID: 'cadomos/itmounts-student-example',
    COS_GRADUATE_AI_ARTIFACT_HASH: 'b'.repeat(64),
    COS_GRADUATE_AI_API_KEY: 'test-secret-value-with-sufficient-length',
  }, () => {
    assert.equal(graduateRuntimeConfigFromEnv(), null)
    assert.equal(graduateRuntimeReadiness().configured, false)
  })
})

test('runtime activation is exact no-fallback canary, not a config-only status flip', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'lib/ai/cos/cosUniversityGraduateRuntime.ts'), 'utf8')
  assert.match(source, /noFallbackCanary/)
  assert.match(source, /graduate_runtime_canary_healthy/)
  assert.match(source, /status:\s*'active'/)
  assert.match(source, /activation_evidence_hash/)
  assert.doesNotMatch(source, /callLocalModel\(/)
})

test('admin runtime canary requires explicit owner confirmation', () => {
  const route = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/cos-university-graduate-runtime/route.ts'), 'utf8')
  assert.match(route, /requireOwner\(\)/)
  assert.match(route, /confirmCanary\s*!==\s*true/)
  assert.match(route, /graduate_runtime_explicit_canary_confirmation_required/)
})
