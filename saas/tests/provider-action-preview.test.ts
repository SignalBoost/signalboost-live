import assert from 'node:assert/strict'
import test from 'node:test'

import { buildProviderActionPreview, providerExecutionModeLabel } from '../lib/hub/provider-action-preview.ts'
import { createProviderExecutionPolicy } from '../lib/hub/provider-execution-modes.ts'

const policy = createProviderExecutionPolicy({
  preferredMode: 'cosa_pr',
  capabilities: [
    { mode: 'direct', available: true, endpoint: '/api/hub/action' },
    { mode: 'cosa_pr', available: true, endpoint: '/api/hub/action/cosa-pr' },
    { mode: 'browser_agent', available: true, browserAdapterId: 'supabase.console.v1', approvedOrigin: 'https://supabase.com' },
    { mode: 'manual', available: true },
  ],
})

test('product-facing copy describes the fallback as direct configuration', () => {
  assert.equal(providerExecutionModeLabel('manual'), 'Direct configuration')
  assert.equal(providerExecutionModeLabel('browser_agent'), 'Browser Agent assistance')
})

test('preview includes the required governed action fields and does not execute non-direct modes', () => {
  const preview = buildProviderActionPreview({
    templateId: 'supabase.create_project',
    provider: 'supabase',
    target: 'organization/example',
    payload: { name: 'New project', region: 'us-east-1' },
    mode: 'cosa_pr',
    policy,
    approvalRequired: true,
    expectedVerification: 'Project proposal matches the approved organization, name, and region.',
  })

  assert.equal(preview.templateId, 'supabase.create_project')
  assert.equal(preview.provider, 'supabase')
  assert.equal(preview.modeLabel, 'Governed AI infrastructure PR')
  assert.equal(preview.executesProviderMutation, false)
  assert.equal(preview.approvalRequired, true)
  assert.equal(Object.isFrozen(preview), true)
  assert.equal(Object.isFrozen(preview.payload), true)
})

test('preview redacts credential-shaped fields recursively', () => {
  const preview = buildProviderActionPreview({
    templateId: 'provider.configure',
    provider: 'provider',
    target: 'account/example',
    payload: {
      apiKey: 'should-not-appear',
      nested: { authorization: 'Bearer secret', safe: 'visible' },
      cookieValue: 'session-secret',
    },
    mode: 'manual',
    policy,
    approvalRequired: false,
    expectedVerification: 'Operator confirms the provider configuration.',
  })

  assert.equal(preview.payload.apiKey, '[REDACTED]')
  assert.deepEqual(preview.payload.nested, { authorization: '[REDACTED]', safe: 'visible' })
  assert.equal(preview.payload.cookieValue, '[REDACTED]')
  assert.equal(preview.executesProviderMutation, false)
})

test('unsupported modes and unbounded payloads fail closed', () => {
  const directOnly = createProviderExecutionPolicy()

  assert.throws(() => buildProviderActionPreview({
    templateId: 'provider.action',
    provider: 'provider',
    target: 'account/example',
    payload: {},
    mode: 'browser_agent',
    policy: directOnly,
    approvalRequired: true,
    expectedVerification: 'Verified.',
  }), /provider_execution_mode_unsupported/)

  assert.throws(() => buildProviderActionPreview({
    templateId: 'provider.action',
    provider: 'provider',
    target: 'account/example',
    payload: Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`field${index}`, index])),
    mode: 'direct',
    policy: directOnly,
    approvalRequired: false,
    expectedVerification: 'Verified.',
  }), /provider_preview_payload_too_large/)
})
