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

test('registered providers are discoverable via toMetadata()', () => {
  const ids = buildUniversalProviderRegistry().toMetadata().map((m) => m.providerId)
  assert.ok(ids.includes('github'))
})

test('capability discovery resolves a known read-only GitHub capability', () => {
  const cap = buildUniversalProviderRegistry().findCapability('github', 'github.repositories.list')
  assert.equal(cap.readOnly, true)
  assert.equal(cap.riskClass, 'read_only')
})

test('getUniversalProviderRegistry returns a stable singleton', () => {
  assert.equal(getUniversalProviderRegistry(), getUniversalProviderRegistry())
})
