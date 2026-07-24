import test from 'node:test'
import assert from 'node:assert/strict'
import { runPortableBrowserStartupPreflight } from '../lib/portable-browser/browser-startup-preflight.ts'
import type { PortableBrowserBuyerConfiguration } from '../lib/portable-browser/browser-buyer-configuration.ts'
import type { PortableBrowserHostCapabilities } from '../lib/portable-browser/browser-host-capabilities.ts'

const configuration: PortableBrowserBuyerConfiguration = {
  schemaVersion: '1.0.0',
  deploymentMode: 'local',
  providerId: 'playwright',
  approvedOrigins: ['http://localhost:4173'],
  lifecycle: { maxConcurrentSessions: 4, maxSessionAgeMs: 60_000, cleanupBatchSize: 2 },
  security: { productionExecutionEnabled: false, executeChangeEnabled: false, buyerManagedCredentials: true, requireApproval: true },
  telemetry: { mode: 'disabled' },
  evidence: { retentionMode: 'memory' },
}

const host: PortableBrowserHostCapabilities = {
  ports: ['session'],
  capabilities: [],
  environments: ['local', 'sandbox'],
  runtimeLanguages: ['typescript'],
  authenticationModes: [],
  dataResidencies: [],
  maximumConcurrentSessions: 10,
  maximumSessionDurationMs: 120_000,
  productionEnabled: false,
  configurationKeys: [],
  hostRestrictions: [],
}

test('passes startup preflight for compatible buyer-controlled deployment', () => {
  const result = runPortableBrowserStartupPreflight({ configuration, host, registeredProviderIds: ['playwright'] })
  assert.equal(result.ready, true)
  assert.deepEqual(result.errors, [])
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.checks))
})

test('fails closed for missing provider and unsafe production host', () => {
  const result = runPortableBrowserStartupPreflight({
    configuration,
    host: { ...host, productionEnabled: true },
    registeredProviderIds: ['browserbase'],
  })
  assert.equal(result.ready, false)
  assert.deepEqual(result.errors, ['host_production_execution_enabled', 'provider_not_registered'])
})

test('reports host capacity, duration, environment, and port incompatibilities', () => {
  const result = runPortableBrowserStartupPreflight({
    configuration,
    host: { ...host, ports: [], environments: ['sandbox'], maximumConcurrentSessions: 1, maximumSessionDurationMs: 1_000 },
    registeredProviderIds: ['playwright'],
  })
  assert.equal(result.ready, false)
  assert.deepEqual(result.errors, [
    'deployment_environment_unsupported',
    'host_session_capacity_insufficient',
    'host_session_duration_insufficient',
    'session_port_unavailable',
  ])
})

test('rejects malformed and duplicate provider registries', () => {
  assert.throws(() => runPortableBrowserStartupPreflight({ configuration, host, registeredProviderIds: ['Invalid Provider'] }), /provider_registry_invalid/)
  assert.throws(() => runPortableBrowserStartupPreflight({ configuration, host, registeredProviderIds: ['playwright', 'playwright'] }), /duplicate/)
})
