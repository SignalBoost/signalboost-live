import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertProviderExecutionMode,
  createProviderExecutionPolicy,
  resolvePreferredMode,
} from '../lib/hub/provider-execution-modes.ts'

test('legacy templates default to direct execution with manual fallback', () => {
  const policy = createProviderExecutionPolicy()

  assert.equal(policy.preferredMode, 'direct')
  assert.deepEqual(policy.capabilities.map(capability => capability.mode), ['direct', 'manual'])
  assert.equal(assertProviderExecutionMode(policy, 'direct').endpoint, '/api/hub/action')
  assert.equal(assertProviderExecutionMode(policy, 'manual').mode, 'manual')
})

test('preferred mode falls back in governed priority order', () => {
  const capabilities = [
    { mode: 'direct' as const, available: false },
    { mode: 'cosa_pr' as const, available: true },
    { mode: 'browser_agent' as const, available: true, browserAdapterId: 'supabase.console.v1', approvedOrigin: 'https://supabase.com' },
    { mode: 'manual' as const, available: true },
  ]

  assert.equal(resolvePreferredMode('direct', capabilities), 'cosa_pr')
})

test('browser agent mode fails closed without a reviewed adapter and approved origin', () => {
  const missingAdapter = createProviderExecutionPolicy({
    preferredMode: 'browser_agent',
    capabilities: [{ mode: 'browser_agent', available: true, approvedOrigin: 'https://supabase.com' }],
  })
  assert.throws(() => assertProviderExecutionMode(missingAdapter, 'browser_agent'), /browser_adapter_required/)

  const missingOrigin = createProviderExecutionPolicy({
    preferredMode: 'browser_agent',
    capabilities: [{ mode: 'browser_agent', available: true, browserAdapterId: 'supabase.console.v1' }],
  })
  assert.throws(() => assertProviderExecutionMode(missingOrigin, 'browser_agent'), /browser_approved_origin_required/)
})

test('browser approved origin must be an HTTPS origin without path, query, fragment, or credentials', () => {
  for (const approvedOrigin of [
    'http://supabase.com',
    'https://supabase.com/dashboard',
    'https://supabase.com/?token=secret',
    'https://user:pass@supabase.com',
  ]) {
    const policy = createProviderExecutionPolicy({
      preferredMode: 'browser_agent',
      capabilities: [{ mode: 'browser_agent', available: true, browserAdapterId: 'supabase.console.v1', approvedOrigin }],
    })
    assert.throws(() => assertProviderExecutionMode(policy, 'browser_agent'))
  }
})

test('unsupported modes are rejected and policy output is immutable', () => {
  const policy = createProviderExecutionPolicy()

  assert.throws(() => assertProviderExecutionMode(policy, 'browser_agent'), /provider_execution_mode_unsupported/)
  assert.equal(Object.isFrozen(policy), true)
  assert.equal(Object.isFrozen(policy.capabilities), true)
  assert.equal(Object.isFrozen(policy.capabilities[0]), true)
})
