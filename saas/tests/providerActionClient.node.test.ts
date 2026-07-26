// saas/tests/providerActionClient.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProviderActionClientPlan,
  chooseReviewedProviderMode,
  submitProviderActionClientPlan,
} from '../lib/hub/provider-action-client.ts'

const baseCapabilities = {
  ok: true,
  preferredMode: 'direct' as const,
  availableModes: ['direct', 'manual'] as const,
}

test('uses a requested reviewed mode', () => {
  assert.equal(chooseReviewedProviderMode('manual', baseCapabilities), 'manual')
})

test('falls back to the reviewed preferred mode', () => {
  assert.equal(chooseReviewedProviderMode('browser_agent', baseCapabilities), 'direct')
})

test('fails closed when no reviewed modes are available', () => {
  assert.throws(
    () => chooseReviewedProviderMode('direct', { ok: true, availableModes: [] }),
    /provider_execution_mode_unavailable/,
  )
})

test('direct configuration produces no provider endpoint', () => {
  const plan = buildProviderActionClientPlan({
    templateId: 'stripe.create_product',
    payload: { name: 'Example' },
    mode: 'manual',
    capabilities: baseCapabilities,
  })
  assert.equal(plan.endpoint, null)
  assert.equal(plan.executesProviderMutation, false)
  assert.equal(plan.productLabel, 'Direct configuration')
})

test('browser assistance uses only reviewed adapter metadata', () => {
  const plan = buildProviderActionClientPlan({
    templateId: 'example.update',
    payload: { id: '123' },
    mode: 'browser_agent',
    capabilities: {
      ok: true,
      preferredMode: 'browser_agent',
      availableModes: ['browser_agent'],
      browserAdapterId: 'reviewed-example-adapter',
      approvedOrigins: ['https://example.com'],
    },
  })
  assert.equal(plan.endpoint, '/api/hub/action/browser-agent/dry-run')
  assert.equal(plan.approvedOrigin, 'https://example.com')
  assert.equal(plan.executesProviderMutation, false)
})

test('direct configuration returns locally without a fetch', async () => {
  const plan = buildProviderActionClientPlan({
    templateId: 'stripe.create_product',
    payload: { name: 'Example' },
    mode: 'manual',
    capabilities: baseCapabilities,
  })
  let called = false
  const result = await submitProviderActionClientPlan(plan, (async () => {
    called = true
    throw new Error('fetch should not run')
  }) as typeof fetch) as { ok: boolean; executesProviderMutation: boolean }
  assert.equal(called, false)
  assert.equal(result.ok, true)
  assert.equal(result.executesProviderMutation, false)
})

test('non-direct reviewed routes remain non-mutating', () => {
  for (const mode of ['cosa_pr', 'browser_agent', 'manual'] as const) {
    const capabilities = mode === 'browser_agent'
      ? {
          ok: true,
          availableModes: [mode],
          browserAdapterId: 'reviewed-adapter',
          approvedOrigins: ['https://example.com'],
        }
      : { ok: true, availableModes: [mode] }
    const plan = buildProviderActionClientPlan({
      templateId: 'example.update',
      payload: { id: '123' },
      mode,
      capabilities,
    })
    assert.equal(plan.executesProviderMutation, false)
  }
})
