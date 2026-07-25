import assert from 'node:assert/strict'
import test from 'node:test'

import { planProviderActionSubmission } from '../lib/hub/provider-action-submit.ts'

test('direct actions use the existing provider executor and are the only mutating plan', () => {
  const plan = planProviderActionSubmission({ templateId: 'stripe.create_product', payload: { name: 'Example' }, mode: 'direct' })
  assert.equal(plan.endpoint, '/api/hub/action')
  assert.equal(plan.executesProviderMutation, true)
  assert.equal(plan.productLabel, 'Direct API')
})

test('portable engine providers retain their existing executor route', () => {
  const plan = planProviderActionSubmission({ templateId: 'github.create_issue', payload: { title: 'Example' }, mode: 'direct' })
  assert.equal(plan.endpoint, '/api/hub/action/engine')
})

test('COSA PR stages a proposal without provider mutation', () => {
  const plan = planProviderActionSubmission({ templateId: 'vercel.add_env_var', payload: { key: 'EXAMPLE' }, mode: 'cosa_pr' })
  assert.equal(plan.endpoint, '/api/hub/action/cosa-pr')
  assert.equal(plan.executesProviderMutation, false)
  assert.equal(plan.requiresOwnerApproval, true)
})

test('Browser Agent is dry-run only and requires reviewed adapter metadata', () => {
  assert.throws(
    () => planProviderActionSubmission({ templateId: 'vercel.add_env_var', payload: {}, mode: 'browser_agent' }),
    /browser_adapter_required/,
  )
  const plan = planProviderActionSubmission({
    templateId: 'vercel.add_env_var',
    payload: {},
    mode: 'browser_agent',
    browserAdapterId: 'vercel-console-v1',
    approvedOrigin: 'https://vercel.com',
  })
  assert.equal(plan.endpoint, '/api/hub/action/browser-agent/dry-run')
  assert.equal(plan.executesProviderMutation, false)
})

test('Direct configuration never calls a provider endpoint and avoids manual product copy', () => {
  const plan = planProviderActionSubmission({ templateId: 'stripe.create_product', payload: {}, mode: 'manual' })
  assert.equal(plan.endpoint, null)
  assert.equal(plan.executesProviderMutation, false)
  assert.equal(plan.productLabel, 'Direct configuration')
  assert.doesNotMatch(plan.productLabel, /manual/i)
})
