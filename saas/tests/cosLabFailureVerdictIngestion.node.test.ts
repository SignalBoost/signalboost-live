import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { generateKeyPairSync } from 'node:crypto'
import { parseLabTrustedVerifierKeys } from '../lib/ai/cos/cosLabTrustedVerifierKeys.ts'

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

test('trust store accepts only nonempty, valid Ed25519 public-key maps', () => {
  const ed = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString()
  assert.equal(parseLabTrustedVerifierKeys(undefined), null)
  assert.equal(parseLabTrustedVerifierKeys('{}'), null)
  assert.equal(parseLabTrustedVerifierKeys('[]'), null)
  assert.equal(parseLabTrustedVerifierKeys(JSON.stringify({ evaluator: 'not a key' })), null)
  assert.equal(parseLabTrustedVerifierKeys(JSON.stringify({ evaluator: rsa })), null)
  assert.equal(parseLabTrustedVerifierKeys(JSON.stringify({ evaluator: ed, broken: rsa })), null)
  assert.equal(parseLabTrustedVerifierKeys(JSON.stringify({ 'invalid key name': ed })), null)
  assert.equal(parseLabTrustedVerifierKeys(JSON.stringify({ evaluator: ed }))?.evaluator, ed)
})
