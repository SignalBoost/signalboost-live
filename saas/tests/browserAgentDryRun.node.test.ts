// saas/tests/browserAgentDryRun.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildBrowserAgentDryRunPackage } from '../lib/hub/browser-agent-dry-run.ts'

const payload = { name: 'example', apiKey: 'secret-value' }

test('builds an approval-bound non-executing browser dry-run package', () => {
  const dryRun = buildBrowserAgentDryRunPackage({
    templateId: 'stripe.create_product',
    payload,
    adapterId: 'stripe-admin-v1',
    approvedOrigin: 'https://dashboard.stripe.com',
    now: new Date('2026-07-25T00:00:00.000Z'),
  })

  assert.equal(dryRun.mode, 'dry_run')
  assert.equal(dryRun.preview.mode, 'browser_agent')
  assert.equal(dryRun.preview.modeLabel, 'Browser Agent assistance')
  assert.equal(dryRun.preview.executesProviderMutation, false)
  assert.equal(dryRun.browserLaunched, false)
  assert.equal(dryRun.providerMutationExecuted, false)
  assert.equal(dryRun.runtimeApprovalCreated, false)
  assert.equal(dryRun.approvalRequired, true)
  assert.equal(dryRun.preview.payload.apiKey, '[REDACTED]')
})

test('rejects unsafe origins and missing reviewed adapters', () => {
  assert.throws(() => buildBrowserAgentDryRunPackage({
    templateId: 'stripe.create_product',
    payload,
    adapterId: '',
    approvedOrigin: 'https://dashboard.stripe.com',
  }), /browser_adapter_required/)

  assert.throws(() => buildBrowserAgentDryRunPackage({
    templateId: 'stripe.create_product',
    payload,
    adapterId: 'stripe-admin-v1',
    approvedOrigin: 'http://dashboard.stripe.com',
  }), /browser_approved_origin_must_be_https/)

  assert.throws(() => buildBrowserAgentDryRunPackage({
    templateId: 'stripe.create_product',
    payload,
    adapterId: 'stripe-admin-v1',
    approvedOrigin: 'https://dashboard.stripe.com/settings',
  }), /browser_approved_origin_must_be_origin_only/)
})
