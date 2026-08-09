import assert from 'node:assert/strict'
import test from 'node:test'
import { findRevenueProvider, REVENUE_PROVIDER_CATALOG, revenueProvidersFor } from '../lib/revenue-operations/providerCatalog.ts'

test('revenue provider ids are unique and disabled by default', () => {
  const ids = REVENUE_PROVIDER_CATALOG.map(provider => provider.providerId)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(REVENUE_PROVIDER_CATALOG.every(provider => provider.enabledByDefault === false), true)
})

test('accounting catalog includes dedicated providers and universal fallback', () => {
  const providers = revenueProvidersFor('accounting')
  assert.equal(providers.some(provider => provider.providerId === 'quickbooks-online'), true)
  assert.equal(providers.some(provider => provider.providerId === 'netsuite'), true)
  assert.equal(providers.some(provider => provider.providerId === 'universal-revenue-adapter'), true)
})

test('universal adapter exposes invoice, payment and subscription capabilities', () => {
  const universal = findRevenueProvider('universal-revenue-adapter')
  assert.ok(universal)
  assert.equal(universal.capabilities.includes('invoice_create'), true)
  assert.equal(universal.capabilities.includes('payment_status'), true)
  assert.equal(universal.capabilities.includes('subscription_lookup'), true)
})
