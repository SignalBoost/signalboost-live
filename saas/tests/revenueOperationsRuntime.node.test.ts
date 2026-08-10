import assert from 'node:assert/strict'
import test from 'node:test'
import { revenueRuntimeAdapter, revenueRuntimeAdapters } from '../lib/revenue-operations/runtimeRegistry.ts'

test('production revenue runtime registers real adapters', () => {
  const ids = revenueRuntimeAdapters().map(adapter => adapter.providerId)
  assert.deepEqual(ids, ['quickbooks-online','stripe','stripe-billing','universal-revenue-adapter'])
  assert.equal(new Set(ids).size, ids.length)
})

test('QuickBooks exposes live accounting capabilities', () => {
  const adapter = revenueRuntimeAdapter('quickbooks-online')
  assert.ok(adapter)
  assert.equal(adapter.domain, 'accounting')
  assert.ok(adapter.capabilities.includes('invoice_create'))
  assert.ok(adapter.capabilities.includes('invoice_status'))
  assert.ok(adapter.capabilities.includes('quote_create'))
})

test('Stripe payment and billing remain separate provider contracts', () => {
  const payment = revenueRuntimeAdapter('stripe')
  const billing = revenueRuntimeAdapter('stripe-billing')
  assert.equal(payment?.domain, 'payment')
  assert.equal(billing?.domain, 'subscription')
  assert.ok(payment?.capabilities.includes('payment_status'))
  assert.ok(billing?.capabilities.includes('subscription_create'))
})

test('universal adapter supports all declared revenue capabilities', () => {
  const adapter = revenueRuntimeAdapter('universal-revenue-adapter')
  assert.ok(adapter)
  assert.equal(adapter.domain, 'universal')
  assert.ok(adapter.capabilities.includes('customer_lookup'))
  assert.ok(adapter.capabilities.includes('invoice_create'))
  assert.ok(adapter.capabilities.includes('subscription_update'))
  assert.ok(adapter.capabilities.includes('tax_estimate'))
  assert.ok(adapter.capabilities.includes('document_send'))
})
