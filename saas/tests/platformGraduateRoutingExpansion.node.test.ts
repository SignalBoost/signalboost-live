import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('shared Platform AI port consults active primary graduates before base runtime', () => {
  const source = readFileSync(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8')
  assert.match(source, /activeGraduateRuntimesForRole\(role, input\.prompt\)/)
  assert.match(source, /tryActiveGraduate\('primary', input\)/)
  assert.match(source, /currentReasoningEvaluationContext\(\)/)
  const graduateIndex = source.indexOf("tryActiveGraduate('primary', input)")
  const baseIndex = source.indexOf("callCosText({ ...input, modelPreference: 'local'")
  assert.ok(graduateIndex >= 0 && baseIndex > graduateIndex, 'graduate must be attempted before base Platform AI')
})

test('Builder consults only coder-scoped graduates and retains existing coding model fallback', () => {
  const source = readFileSync(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8')
  assert.match(source, /tryActiveGraduate\('coder', input, \{ coding: true \}\)/)
  assert.match(source, /builderCodingModelFromEnv\(\)/)
  assert.match(source, /fallbackFromOwned:\s*graduate\.attempted/)
})

test('graduate inference config carries exact iTMounts artifact ownership into telemetry', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityGraduateRuntime.ts', import.meta.url), 'utf8')
  assert.match(source, /routeOwner:\s*'itmounts'/)
  assert.match(source, /graduateCandidateId:\s*candidateId/)
  assert.match(source, /graduateArtifactId:\s*artifactId/)
  assert.match(source, /graduateArtifactHash:\s*artifactHash/)
  assert.match(source, /provider:\s*runtime\.provider/)
})

test('inference telemetry separates model ownership from compute provider and persists DeepInfra plus owned graduates', () => {
  const inference = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  assert.match(inference, /routeOwner/)
  assert.match(inference, /graduateArtifactId/)
  assert.match(inference, /function shouldPersistUsage/)
  assert.match(inference, /provider === 'deepinfra'/)
  assert.match(inference, /config\.routeOwner === 'itmounts'/)
  assert.match(inference, /if \(shouldPersistUsage\(provider, config\)\)/)
  assert.match(inference, /const reasoningEffort = provider === 'deepinfra'/)
})

test('provider usage migration records ownership and owned-fallback attribution', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260914002500_provider_inference_route_ownership.sql', import.meta.url), 'utf8')
  assert.match(migration, /route_owner/)
  assert.match(migration, /graduate_candidate_id/)
  assert.match(migration, /graduate_artifact_id/)
  assert.match(migration, /fallback_from_owned/)
})
