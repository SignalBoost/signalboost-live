import assert from 'node:assert/strict'
import test from 'node:test'

import { planProviderActionSubmission } from '../lib/hub/provider-action-submit.ts'

test('direct configuration is explicitly endpoint-free', () => {
  const plan = planProviderActionSubmission({ templateId: 'vercel.add_env_var', payload: {}, mode: 'manual' })
  assert.equal(plan.endpoint, null)
  assert.equal(plan.productLabel, 'Direct configuration')
})
