import assert from 'node:assert/strict'
import test from 'node:test'

import { planProviderActionSubmission } from '../lib/hub/provider-action-submit.ts'

test('non-direct plans cannot claim provider mutation', () => {
  for (const mode of ['cosa_pr', 'manual'] as const) {
    const plan = planProviderActionSubmission({ templateId: 'stripe.create_product', payload: {}, mode })
    assert.equal(plan.executesProviderMutation, false)
  }
})
