import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveProviderPreference } from '../lib/ai/providerRouter.ts'

test('default provider preference is local', () => {
  assert.equal(resolveProviderPreference(undefined, undefined), 'local')
  assert.equal(resolveProviderPreference(undefined, ''), 'local')
})
test('explicit preference is retained for downstream policy enforcement', () => {
  assert.equal(resolveProviderPreference('local', undefined), 'local')
  assert.equal(resolveProviderPreference('claude', undefined), 'claude')
})
test('hosted and unknown environment preferences fall back to local', () => {
  for (const value of ['openai', 'claude', 'gemini', 'not-a-real-provider']) assert.equal(resolveProviderPreference(undefined, value), 'local')
})
