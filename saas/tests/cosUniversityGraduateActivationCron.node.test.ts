// saas/tests/cosUniversityGraduateActivationCron.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const route = readFileSync('app/api/cron/cos-university-graduate-activation/route.ts', 'utf8')
const vercel = readFileSync('vercel.json', 'utf8')
const runtime = readFileSync('lib/ai/cos/cosUniversityGraduateRuntime.ts', 'utf8')

test('the activation caller exists and is scheduled — promoted graduates cannot sit pending forever', () => {
  // activateGraduateRuntime had zero callers: promotion wrote pending_runtime, COS routing read
  // active, and nothing bridged them. This cron is that bridge.
  assert.match(route, /activateGraduateRuntime\(\{/)
  assert.match(vercel, /"\/api\/cron\/cos-university-graduate-activation", "schedule": "\*\/10 \* \* \* \*"/)
})

test('fail-closed owner switch, no new approval SQL class', () => {
  assert.match(route, /COS_GRADUATE_ACTIVATION_ENABLED/)
  assert.match(route, /!== 'true'/)
  assert.match(route, /graduate_activation_disabled/)
})

test('every hard gate stays inside activateGraduateRuntime, not the route', () => {
  assert.match(runtime, /graduate_runtime_promotion_evidence_missing/)
  assert.match(runtime, /graduate_runtime_rollback_missing/)
  assert.match(runtime, /graduate_runtime_authority_expansion_forbidden/)
  assert.match(runtime, /health\.model !== decision\.runtimeModelId/)
  assert.doesNotMatch(route, /status: 'active'/)
})

test('initial scope is narrow and per-subject; an undeclared subject halts rather than defaults', () => {
  assert.match(route, /workerRoles: \['critic', 'verifier'\]/)
  assert.match(route, /problemClasses: \['reasoning_decision_science'\]/)
  assert.match(route, /graduate_subject_scope_undeclared/)
  assert.doesNotMatch(route, /'primary'/)
})

test('the served identity is the runtime serving name, not the artifact repo id', () => {
  assert.match(route, /runtimeModelId: DISTILLED_MODEL_NAME/)
  assert.doesNotMatch(route, /DISTILLED_ADAPTER_MODEL_ID/)
})

test('outcomes are recorded either way — success, blockers, and throws all leave evidence', () => {
  const recordCount = (route.match(/recordCosUniversityProductionPath\(/g) || []).length
  assert.ok(recordCount >= 3, `expected 3 recording sites, found ${recordCount}`)
  assert.match(route, /path: 'graduate_runtime_activation'/)
})
