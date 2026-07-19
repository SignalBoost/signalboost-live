import test from 'node:test'
import assert from 'node:assert/strict'
import { buildUniversalProviderRegistry, getUniversalProviderRegistry } from '../lib/provider-framework/provider-registry-bootstrap.ts'

const expectedProviders = [
  ['github', 13],
  ['stripe', 10],
  ['supabase', 8],
  ['cloudflare', 10],
  ['aws', 10],
  ['azure', 10],
  ['google-cloud', 10],
  ['namecheap', 10],
  ['digitalocean', 10],
  ['vercel', 10],
  ['netlify', 10],
  ['railway', 10],
  ['render', 10],
  ['flyio', 10],
  ['cloudinary', 10],
  ['bunnycdn', 10],
  ['upstash', 10],
  ['neon', 10],
  ['planetscale', 10],
  ['mongodb-atlas', 10],
] as const

test('bootstrap registers every provider into the canonical registry', () => {
  const registry = buildUniversalProviderRegistry()
  for (const [providerId, minimumCapabilities] of expectedProviders) {
    const provider = registry.get(providerId)
    assert.equal(provider.metadata.providerId, providerId)
    assert.ok(provider.metadata.capabilities.length >= minimumCapabilities)
    assert.ok(provider.metadata.capabilities.every((capability) => capability.readOnly), `${providerId} capabilities must be read-only`)
    assert.ok(provider.metadata.capabilities.every((capability) => capability.riskClass === 'read_only'))
  }
})

test('registered providers are discoverable via toMetadata()', () => {
  const ids = new Set(buildUniversalProviderRegistry().toMetadata().map((metadata) => metadata.providerId))
  for (const [providerId] of expectedProviders) assert.ok(ids.has(providerId), `${providerId} must be discoverable`)
})

test('hosted provider capability discovery resolves known read-only capabilities', () => {
  const registry = buildUniversalProviderRegistry()
  const knownCapabilities = [
    ['digitalocean', 'digitalocean.droplets.list'],
    ['vercel', 'vercel.projects.list'],
    ['netlify', 'netlify.sites.list'],
    ['railway', 'railway.projects.list'],
    ['render', 'render.services.list'],
    ['flyio', 'flyio.apps.list'],
    ['cloudinary', 'cloudinary.resources.list'],
    ['bunnycdn', 'bunnycdn.pull_zones.list'],
    ['upstash', 'upstash.redis.databases.list'],
    ['neon', 'neon.projects.list'],
    ['planetscale', 'planetscale.databases.list'],
    ['mongodb-atlas', 'mongodb_atlas.clusters.list'],
  ] as const

  for (const [providerId, capabilityId] of knownCapabilities) {
    const capability = registry.findCapability(providerId, capabilityId)
    assert.equal(capability.readOnly, true)
    assert.equal(capability.riskClass, 'read_only')
    assert.equal(capability.requiresApproval, false)
  }
})

test('getUniversalProviderRegistry returns a stable singleton', () => {
  assert.equal(getUniversalProviderRegistry(), getUniversalProviderRegistry())
})
