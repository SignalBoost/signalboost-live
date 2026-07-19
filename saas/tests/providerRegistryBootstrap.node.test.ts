import test from 'node:test'
import assert from 'node:assert/strict'
import { buildUniversalProviderRegistry, getUniversalProviderRegistry } from '../lib/provider-framework/provider-registry-bootstrap.ts'

test('bootstrap registers the GitHub provider into the canonical registry', () => {
  const registry = buildUniversalProviderRegistry()
  const github = registry.get('github')
  assert.equal(github.metadata.providerId, 'github')
  assert.ok(github.metadata.capabilities.length >= 13)
  assert.ok(github.metadata.capabilities.every((c) => c.readOnly), 'all GitHub capabilities must be read-only')
})

test('bootstrap registers the Stripe provider into the canonical registry', () => {
  const registry = buildUniversalProviderRegistry()
  const stripe = registry.get('stripe')
  assert.equal(stripe.metadata.providerId, 'stripe')
  assert.ok(stripe.metadata.capabilities.length >= 10)
  assert.ok(stripe.metadata.capabilities.every((c) => c.readOnly), 'all Stripe capabilities must be read-only')
  assert.ok(stripe.metadata.capabilities.every((c) => c.riskClass === 'read_only'))
})

test('bootstrap registers the Supabase provider into the canonical registry', () => {
  const registry = buildUniversalProviderRegistry()
  const supabase = registry.get('supabase')
  assert.equal(supabase.metadata.providerId, 'supabase')
  assert.ok(supabase.metadata.capabilities.length >= 8)
  assert.ok(supabase.metadata.capabilities.every((c) => c.readOnly), 'all Supabase capabilities must be read-only')
  assert.ok(supabase.metadata.capabilities.every((c) => c.riskClass === 'read_only'))
})

test('registered providers are discoverable via toMetadata()', () => {
  const ids = buildUniversalProviderRegistry().toMetadata().map((m) => m.providerId)
  assert.ok(ids.includes('github'))
  assert.ok(ids.includes('stripe'))
  assert.ok(ids.includes('supabase'))
})

test('capability discovery resolves known read-only capabilities', () => {
  const registry = buildUniversalProviderRegistry()
  const github = registry.findCapability('github', 'github.repositories.list')
  const stripe = registry.findCapability('stripe', 'stripe.balance.read')
  const supabase = registry.findCapability('supabase', 'supabase.database.health.read')
  assert.equal(github.readOnly, true)
  assert.equal(github.riskClass, 'read_only')
  assert.equal(stripe.readOnly, true)
  assert.equal(stripe.riskClass, 'read_only')
  assert.equal(supabase.readOnly, true)
  assert.equal(supabase.riskClass, 'read_only')
})

test('getUniversalProviderRegistry returns a stable singleton', () => {
  assert.equal(getUniversalProviderRegistry(), getUniversalProviderRegistry())
})
