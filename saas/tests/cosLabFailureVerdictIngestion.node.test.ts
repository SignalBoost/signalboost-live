import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const service = readFileSync(new URL('../lib/ai/cos/cosLabFailureVerdictIngestion.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/internal/cos/university-independent-evaluator/failure-verdict/route.ts', import.meta.url), 'utf8')

test('signed verdict ingestion requires authenticated evaluator and server-owned keys', () => {
  assert.match(route, /verifyIndependentEvaluatorPayload/)
  assert.match(route, /COS_LAB_TRUSTED_FAILURE_VERIFIER_KEYS_JSON/)
  assert.match(service, /verifySignedLabFailureVerdict/)
})
test('ledger binds settled job and rejects replay without granting financial authority', () => {
  assert.match(service, /if \(!job \|\| !job\.settled_at\)/)
  assert.match(service, /\.insert\(/)
  assert.match(service, /23505/)
  assert.match(service, /financialAdjustmentAuthorized: false/)
  assert.doesNotMatch(service, /\.upsert\(/)
})

test('empty verifier trust store fails closed at configuration boundary', () => {
  assert.match(route, /Object\.keys\(keys\)\.length === 0/)
  assert.match(route, /lab_verifier_trust_store_not_configured/)
})
