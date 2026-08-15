import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'
import { normalizeCouncilMachinePrediction, resolveCouncilMachinePrediction } from '../lib/ai/cos/councilMachinePrediction.ts'
import { extractCouncilCognitiveSkillRefs } from '../lib/ai/cos/councilPromptProvenance.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const migrationPath = path.join(here, '../supabase/migrations/20260815_cos_council_deterministic_claim_resolution.sql')

test('normalizes only bounded machine fact paths and operators', () => {
  assert.deepEqual(normalizeCouncilMachinePrediction({ fact_path: 'verified', operator: 'eq', expected: true }), { factPath: 'verified', operator: 'eq', expected: true })
  assert.equal(normalizeCouncilMachinePrediction({ fact_path: 'raw_secret', operator: 'eq', expected: 'x' }), null)
  assert.equal(normalizeCouncilMachinePrediction({ fact_path: 'verified', operator: 'contains', expected: true }), null)
})

test('numeric comparison operators reject non-numeric expected values', () => {
  assert.equal(normalizeCouncilMachinePrediction({ fact_path: 'currentIntervalSeconds', operator: 'gte', expected: '3600' }), null)
  assert.deepEqual(normalizeCouncilMachinePrediction({ fact_path: 'currentIntervalSeconds', operator: 'gte', expected: 3600 }), { factPath: 'currentIntervalSeconds', operator: 'gte', expected: 3600 })
})

test('missing objective fact remains unresolved rather than guessed', () => {
  const prediction = normalizeCouncilMachinePrediction({ fact_path: 'verified', operator: 'eq', expected: true })!
  assert.deepEqual(resolveCouncilMachinePrediction(prediction, {}, 'observed'), { verdict: 'unresolved' })
})

test('exact bounded facts mechanically support or refute predictions', () => {
  const verified = normalizeCouncilMachinePrediction({ fact_path: 'verified', operator: 'eq', expected: true })!
  assert.equal(resolveCouncilMachinePrediction(verified, { verified: true }, 'success').verdict, 'supported')
  assert.equal(resolveCouncilMachinePrediction(verified, { verified: false }, 'failure').verdict, 'refuted')
  const state = normalizeCouncilMachinePrediction({ fact_path: 'state', operator: 'eq', expected: 'ready' })!
  assert.equal(resolveCouncilMachinePrediction(state, { state: 'READY' }, 'success').verdict, 'supported')
})

test('synthetic outcome_status is deterministic but still pre-registered', () => {
  const prediction = normalizeCouncilMachinePrediction({ fact_path: 'outcome_status', operator: 'neq', expected: 'failure' })!
  assert.equal(resolveCouncilMachinePrediction(prediction, {}, 'success').verdict, 'supported')
})

test('captures exact SK label to durable skill key mapping from governed context', () => {
  assert.deepEqual(extractCouncilCognitiveSkillRefs('[SK1] [skill_key=diagnose-tenant-tail] Procedure...\n[SK2] no-key'), { '[SK1]': 'diagnose-tenant-tail' })
})

test('migration requires full unanimous per-role prediction resolution before credibility scoring', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  assert.match(sql, /v_resolution_count <> v_prediction_count/i)
  assert.match(sql, /v_distinct_verdicts <> 1/i)
  assert.match(sql, /unique\(session_id, role\)/i)
  assert.match(sql, /deterministic_council_prediction_refuted/i)
  assert.match(sql, /grant execute on function public\.cos_record_council_objective_role_score[\s\S]*to service_role/i)
  assert.match(sql, /revoke all on function public\.cos_record_council_objective_role_score[\s\S]*from authenticated/i)
})
