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

test('bootstrap registers the Cloudflare provider into the canonical registry', () => {
  const registry = buildUniversalProviderRegistry()
  const cloudflare = registry.get('cloudflare')
  assert.equal(cloudflare.metadata.providerId, 'cloudflare')
  assert.ok(cloudflare.metadata.capabilities.length >= 10)
  assert.ok(cloudflare.metadata.capabilities.every((c) => c.readOnly), 'all Cloudflare capabilities must be read-only')
  assert.ok(cloudflare.metadata.capabilities.every((c) => c.riskClass === 'read_only'))
})

test('bootstrap registers the AWS provider into the canonical registry', () => {
  const registry = buildUniversalProviderRegistry()
  const aws = registry.get('aws')
  assert.equal(aws.metadata.providerId, 'aws')
  assert.ok(aws.metadata.capabilities.length >= 10)
  assert.ok(aws.metadata.capabilities.every((c) => c.readOnly), 'all AWS capabilities must be read-only')
  assert.ok(aws.metadata.capabilities.every((c) => c.riskClass === 'read_only'))
})

test('bootstrap registers the Azure provider into the canonical registry', () => {
  const registry = buildUniversalProviderRegistry()
  const azure = registry.get('azure')
  assert.equal(azure.metadata.providerId, 'azure')
  assert.ok(azure.metadata.capabilities.length >= 10)
  assert.ok(azure.metadata.capabilities.every((c) => c.readOnly), 'all Azure capabilities must be read-only')
  assert.ok(azure.metadata.capabilities.every((c) => c.riskClass === 'read_only'))
})

test('bootstrap registers the Google Cloud provider into the canonical registry', () => {
  const registry = buildUniversalProviderRegistry()
  const googleCloud = registry.get('google-cloud')
  assert.equal(googleCloud.metadata.providerId, 'google-cloud')
  assert.ok(googleCloud.metadata.capabilities.length >= 10)
  assert.ok(googleCloud.metadata.capabilities.every((c) => c.readOnly), 'all Google Cloud capabilities must be read-only')
  assert.ok(googleCloud.metadata.capabilities.every((c) => c.riskClass === 'read_only'))
})

test('registered providers are discoverable via toMetadata()', () => {
  const ids = buildUniversalProviderRegistry().toMetadata().map((m) => m.providerId)
  assert.ok(ids.includes('github'))
  assert.ok(ids.includes('stripe'))
  assert.ok(ids.includes('supabase'))
  assert.ok(ids.includes('cloudflare'))
  assert.ok(ids.includes('aws'))
  assert.ok(ids.includes('azure'))
  assert.ok(ids.includes('google-cloud'))
})

test('capability discovery resolves known read-only capabilities', () => {
  const registry = buildUniversalProviderRegistry()
  const github = registry.findCapability('github', 'github.repositories.list')
  const stripe = registry.findCapability('stripe', 'stripe.balance.read')
  const supabase = registry.findCapability('supabase', 'supabase.database.health.read')
  const cloudflare = registry.findCapability('cloudflare', 'cloudflare.zones.list')
  const aws = registry.findCapability('aws', 'aws.ec2.instances.list')
  const azure = registry.findCapability('azure', 'azure.compute.virtual_machines.list')
  const googleCloud = registry.findCapability('google-cloud', 'google_cloud.compute.instances.list')
  assert.equal(github.readOnly, true)
  assert.equal(github.riskClass, 'read_only')
  assert.equal(stripe.readOnly, true)
  assert.equal(stripe.riskClass, 'read_only')
  assert.equal(supabase.readOnly, true)
  assert.equal(supabase.riskClass, 'read_only')
  assert.equal(cloudflare.readOnly, true)
  assert.equal(cloudflare.riskClass, 'read_only')
  assert.equal(aws.readOnly, true)
  assert.equal(aws.riskClass, 'read_only')
  assert.equal(azure.readOnly, true)
  assert.equal(azure.riskClass, 'read_only')
  assert.equal(googleCloud.readOnly, true)
  assert.equal(googleCloud.riskClass, 'read_only')
})

test('getUniversalProviderRegistry returns a stable singleton', () => {
  assert.equal(getUniversalProviderRegistry(), getUniversalProviderRegistry())
})
