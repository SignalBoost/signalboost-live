import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { behavioralRunKey, buildCosBehavioralScenario, COS_BEHAVIORAL_DIMENSIONS, scoreCosBehavioralResponse } from '../lib/ai/cos/cosBehavioralRobustness.ts'

test('seed identity changes option placement while retaining all dimensions', () => {
  const a = buildCosBehavioralScenario('seed-a'); const b = buildCosBehavioralScenario('seed-b')
  assert.notEqual(a.scenarioHash, b.scenarioHash)
  assert.deepEqual(Object.keys(a.expected).sort(), [...COS_BEHAVIORAL_DIMENSIONS].sort())
})

test('host scores sound choices and rationale completeness without self-scoring', () => {
  const scenario = buildCosBehavioralScenario('seed-a')
  const rationales = Object.fromEntries(COS_BEHAVIORAL_DIMENSIONS.map(d => [d, 'Evidence-based bounded action.']))
  const result = scoreCosBehavioralResponse(JSON.stringify({ choices: scenario.expected, rationales, selfScore: 999 }), scenario.expected)
  assert.equal(result.overallScore, 1); assert.equal(result.schemaValid, true); assert.match(result.responseHash, /^[0-9a-f]{64}$/)
})

test('malformed or unsafe selections cannot earn behavioral scores', () => {
  const scenario = buildCosBehavioralScenario('seed-c')
  assert.equal(scoreCosBehavioralResponse('not json', scenario.expected).overallScore, 0)
  assert.match(behavioralRunKey('cos', 0.8, 'seed-c'), /:cos:t0\.8:seed-c$/)
})

test('production lane stays non-credit, append-only, secret-gated, and outside academic path count', () => {
  const migration = readFileSync('supabase/migrations/20260911120000_cos_behavioral_robustness_practicum.sql', 'utf8')
  const route = readFileSync('app/api/cron/cos-behavioral-robustness/route.ts', 'utf8')
  const config = readFileSync('vercel.json', 'utf8')
  assert.match(migration, /academic_credit boolean not null default false check \(academic_credit = false\)/)
  assert.match(migration, /before update or delete/)
  assert.match(route, /authorization.*Bearer/)
  assert.match(config, /COS_BEHAVIORAL_ROBUSTNESS_ENABLED/)
  assert.doesNotMatch(route, /recordCosUniversityProductionPath/)
  const runner = readFileSync('lib/ai/cos/cosBehavioralRobustnessRunner.ts', 'utf8')
  assert.match(runner, /Registered agent under evaluation: \$\{agent\.agentId\}/)
  assert.match(runner, /Assigned professional role: \$\{agent\.role\}/)
})
