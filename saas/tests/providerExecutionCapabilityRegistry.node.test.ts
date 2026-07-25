import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearReviewedProviderExecutionCapabilitiesForTests,
  getProviderExecutionPolicy,
  getReviewedProviderExecutionCapability,
  registerReviewedProviderExecutionCapability,
} from '../lib/hub/provider-execution-capability-registry.ts'

test.afterEach(() => clearReviewedProviderExecutionCapabilitiesForTests())

test('unregistered templates expose only conservative implemented defaults', () => {
  const policy = getProviderExecutionPolicy('stripe.create_product')
  const available = policy.capabilities.filter(item => item.available).map(item => item.mode)

  assert.deepEqual(available, ['direct', 'manual'])
  assert.equal(policy.preferredMode, 'direct')
})

test('reviewed template can expose COSA PR without exposing Browser Agent', () => {
  registerReviewedProviderExecutionCapability({
    templateId: 'vercel.add_env_var',
    reviewer: 'owner@example.com',
    reviewedAt: '2026-07-25T08:00:00.000Z',
    capabilities: [
      { mode: 'direct', available: true, endpoint: '/api/hub/action' },
      { mode: 'cosa_pr', available: true, endpoint: '/api/hub/action/cosa-pr' },
      { mode: 'browser_agent', available: false, reason: 'adapter_not_reviewed' },
      { mode: 'manual', available: true },
    ],
  })

  const policy = getProviderExecutionPolicy('vercel.add_env_var')
  assert.deepEqual(
    policy.capabilities.filter(item => item.available).map(item => item.mode),
    ['direct', 'cosa_pr', 'manual'],
  )
  assert.equal(getReviewedProviderExecutionCapability('vercel.add_env_var')?.reviewer, 'owner@example.com')
})

test('Browser Agent registration fails closed without reviewed adapter metadata', () => {
  assert.throws(() => registerReviewedProviderExecutionCapability({
    templateId: 'github.create_issue',
    reviewer: 'owner@example.com',
    reviewedAt: '2026-07-25T08:00:00.000Z',
    capabilities: [{ mode: 'browser_agent', available: true }],
  }), /browser_adapter_required/)
})

test('Browser Agent registration accepts reviewed HTTPS origin-only metadata', () => {
  registerReviewedProviderExecutionCapability({
    templateId: 'github.create_issue',
    reviewer: 'owner@example.com',
    reviewedAt: '2026-07-25T08:00:00.000Z',
    capabilities: [{
      mode: 'browser_agent',
      available: true,
      endpoint: '/api/hub/action/browser-agent/dry-run',
      browserAdapterId: 'github-browser-v1',
      approvedOrigin: 'https://github.com',
    }],
  })

  const policy = getProviderExecutionPolicy('github.create_issue')
  assert.equal(policy.preferredMode, 'browser_agent')
  assert.equal(policy.capabilities[0]?.approvedOrigin, 'https://github.com')
})

test('review metadata is mandatory and immutable through registry reads', () => {
  assert.throws(() => registerReviewedProviderExecutionCapability({
    templateId: 'stripe.create_product',
    reviewer: '',
    reviewedAt: 'not-a-date',
    capabilities: [{ mode: 'direct', available: true }],
  }), /reviewer_required/)
})
