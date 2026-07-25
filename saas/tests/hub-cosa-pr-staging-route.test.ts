import assert from 'node:assert/strict'
import test from 'node:test'

import { buildProviderActionPreviewFromRequest } from '../lib/hub/provider-action-preview-request.ts'
import { createProviderExecutionPolicy } from '../lib/hub/provider-execution-modes.ts'

const policy = createProviderExecutionPolicy({
  preferredMode: 'cosa_pr',
  capabilities: [{ mode: 'cosa_pr', available: true, endpoint: '/api/hub/action/cosa-pr' }],
})

test('reviewed COSA PR policy produces a non-executing approval-bound preview', () => {
  const result = buildProviderActionPreviewFromRequest({
    templateId: 'stripe.create_product',
    payload: { name: 'Governed product', description: 'Staged only' },
    mode: 'cosa_pr',
    policy,
  })

  assert.equal(result.preview.mode, 'cosa_pr')
  assert.equal(result.preview.modeLabel, 'Governed AI infrastructure PR')
  assert.equal(result.preview.approvalRequired, true)
  assert.equal(result.preview.executesProviderMutation, false)
  assert.match(result.preview.expectedVerification, /merge only after owner approval/i)
})

test('COSA PR preview still validates templates and payloads before staging', () => {
  assert.throws(() => buildProviderActionPreviewFromRequest({
    templateId: 'stripe.create_product',
    payload: {},
    mode: 'cosa_pr',
    policy,
  }), /provider_payload_invalid/)

  assert.throws(() => buildProviderActionPreviewFromRequest({
    templateId: 'unknown.action',
    payload: {},
    mode: 'cosa_pr',
    policy,
  }), /provider_template_not_found/)
})

test('the dedicated COSA policy exposes no direct or browser execution capability', () => {
  assert.deepEqual(policy.capabilities.map(capability => capability.mode), ['cosa_pr'])
  assert.equal(policy.capabilities[0].endpoint, '/api/hub/action/cosa-pr')
})
