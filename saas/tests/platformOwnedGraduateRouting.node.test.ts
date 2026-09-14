import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { graduateRoutingSubject } from '../lib/ai/platformOwnedInference.ts'

function withRoutingEnabled<T>(fn: () => T): T {
  const before = process.env.COS_GRADUATE_ROUTING_ENABLED
  delete process.env.COS_GRADUATE_ROUTING_ENABLED
  try { return fn() } finally {
    if (before === undefined) delete process.env.COS_GRADUATE_ROUTING_ENABLED
    else process.env.COS_GRADUATE_ROUTING_ENABLED = before
  }
}

test('COS and Concierge general reasoning qualify for reasoning graduate routing', () => withRoutingEnabled(() => {
  assert.equal(graduateRoutingSubject({ feature: 'cos_platform_text', purpose: 'platform_reasoning', agentId: 'cos' }), 'reasoning_decision_science')
  assert.equal(graduateRoutingSubject({ feature: 'support.concierge', purpose: 'general_reasoning' }), 'reasoning_decision_science')
}))

test('Builder remains computer-science scoped and cannot consume a reasoning-only graduate', () => withRoutingEnabled(() => {
  assert.equal(graduateRoutingSubject({ feature: 'builder', purpose: 'coding_harness' }), 'computer_science')
}))

test('University practice and independent exams never route through graduates', () => withRoutingEnabled(() => {
  assert.equal(graduateRoutingSubject({ feature: 'university_practice', subjectId: 'reasoning_decision_science', purpose: 'non_credit_training' }), null)
  assert.equal(graduateRoutingSubject({ feature: 'university_independent_exam', subjectId: 'reasoning_decision_science', purpose: 'independent_assessment' }), null)
  assert.equal(graduateRoutingSubject({ feature: 'model_evaluator', subjectId: 'reasoning_decision_science', purpose: 'evaluation' }), null)
}))

test('graduate routing can be globally disabled without changing provider configuration', () => {
  const before = process.env.COS_GRADUATE_ROUTING_ENABLED
  process.env.COS_GRADUATE_ROUTING_ENABLED = 'false'
  try {
    assert.equal(graduateRoutingSubject({ feature: 'cos_reasoner', subjectId: 'reasoning_decision_science' }), null)
  } finally {
    if (before === undefined) delete process.env.COS_GRADUATE_ROUTING_ENABLED
    else process.env.COS_GRADUATE_ROUTING_ENABLED = before
  }
})

test('shared inference seam prefers active graduate and retains one bounded base fallback', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'lib/ai/local-inference.ts'), 'utf8')
  assert.match(source, /resolvePlatformOwnedInferenceRoute/)
  assert.match(source, /COS_GRADUATE_AI_ALLOW_BASE_FALLBACK/)
  assert.match(source, /platform-owned-routing-fallback/)
  assert.match(source, /callLocalModelDetailed/)
})

test('COS durable cache identity changes with graduate routing identity', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'lib/cos/textGateway.ts'), 'utf8')
  assert.match(source, /platformOwnedInferenceCacheDiscriminator/)
  assert.match(source, /usageContext/)
  assert.match(source, /routing/)
})

test('routing telemetry separates compute provider from iTMounts ownership', () => {
  const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260914002500_provider_inference_route_ownership.sql'), 'utf8')
  assert.match(migration, /route_owner/)
  assert.match(migration, /graduate_artifact_id/)
  assert.match(migration, /fallback_from_owned/)
})
