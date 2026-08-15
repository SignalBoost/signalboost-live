import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SELF_HEALING_NATIVE_MONITORING,
  resolveMonitoringMode,
} from '../self-healing-host/native-monitoring-policy.ts'

test('native monitoring is pre-staged, proactive, and enabled without external monitoring', () => {
  assert.equal(SELF_HEALING_NATIVE_MONITORING.enabledByDefault, true)
  assert.equal(SELF_HEALING_NATIVE_MONITORING.externalMonitoringRequired, false)
  assert.equal(SELF_HEALING_NATIVE_MONITORING.proactive, true)
  assert.equal(SELF_HEALING_NATIVE_MONITORING.observationOnly, true)
  assert.equal(resolveMonitoringMode(), 'native')
})

test('buyer can run hybrid or external-only monitoring explicitly', () => {
  assert.equal(resolveMonitoringMode({ nativeEnabled: true, externalConnected: true }), 'hybrid')
  assert.equal(resolveMonitoringMode({ nativeEnabled: false, externalConnected: true }), 'external')
})

test('default native signal pack covers the current proactive platform-health contract', () => {
  for (const signal of [
    'service-health',
    'api-error-rate',
    'api-latency',
    'queue-health',
    'scheduled-job-health',
    'provider-health',
    'database-health',
    'storage-health',
    'persistence-health',
    'certificate-expiry',
    'resource-pressure',
    'configuration-drift',
    'deployment-health',
  ] as const) {
    assert.ok(SELF_HEALING_NATIVE_MONITORING.signals.includes(signal), `missing native signal: ${signal}`)
  }
})
