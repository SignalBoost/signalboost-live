import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PORTABLE_BROWSER_BUYER_CONFIGURATION_SCHEMA_VERSION,
  portableBrowserBuyerConfigurationJsonSchema,
  validatePortableBrowserBuyerConfiguration,
} from '../lib/portable-browser/browser-buyer-configuration.ts'

function validConfiguration() {
  return {
    schemaVersion: PORTABLE_BROWSER_BUYER_CONFIGURATION_SCHEMA_VERSION,
    deploymentMode: 'local',
    providerId: 'playwright',
    approvedOrigins: ['http://127.0.0.1:4173', 'http://localhost:4173'],
    lifecycle: {
      maxConcurrentSessions: 10,
      maxSessionAgeMs: 60_000,
      cleanupBatchSize: 5,
    },
    security: {
      productionExecutionEnabled: false,
      executeChangeEnabled: false,
      buyerManagedCredentials: true,
      requireApproval: true,
    },
    telemetry: { mode: 'disabled' },
    evidence: { retentionMode: 'memory' },
  }
}

test('publishes an immutable machine-readable JSON schema', () => {
  assert.equal(portableBrowserBuyerConfigurationJsonSchema.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.equal(portableBrowserBuyerConfigurationJsonSchema.$id, 'urn:portable-browser:buyer-configuration:1.0.0')
  assert.equal(portableBrowserBuyerConfigurationJsonSchema.additionalProperties, false)
  assert.ok(Object.isFrozen(portableBrowserBuyerConfigurationJsonSchema))
  assert.ok(portableBrowserBuyerConfigurationJsonSchema.required.includes('security'))
})

test('normalizes and freezes valid buyer configuration', () => {
  const result = validatePortableBrowserBuyerConfiguration(validConfiguration())
  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.configuration?.approvedOrigins, [
    'http://127.0.0.1:4173',
    'http://localhost:4173',
  ])
  assert.equal(result.configuration?.security.productionExecutionEnabled, false)
  assert.equal(result.configuration?.security.executeChangeEnabled, false)
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.configuration))
  assert.ok(Object.isFrozen(result.configuration?.lifecycle))
})

test('fails closed for production execution, execute_change, and unmanaged credentials', () => {
  const value = validConfiguration()
  value.security = {
    productionExecutionEnabled: true as false,
    executeChangeEnabled: true as false,
    buyerManagedCredentials: false as true,
    requireApproval: false as true,
  }
  const result = validatePortableBrowserBuyerConfiguration(value)
  assert.equal(result.valid, false)
  assert.deepEqual(result.errors, [
    'approval_required',
    'buyer_managed_credentials_required',
    'execute_change_must_remain_disabled',
    'production_execution_must_remain_disabled',
  ])
})

test('rejects local deployments that target external origins', () => {
  const result = validatePortableBrowserBuyerConfiguration({
    ...validConfiguration(),
    approvedOrigins: ['https://example.com'],
  })
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('local_deployment_requires_loopback_origins'))
})

test('accepts buyer-managed telemetry and evidence only with opaque destination references', () => {
  const result = validatePortableBrowserBuyerConfiguration({
    ...validConfiguration(),
    deploymentMode: 'self_hosted',
    approvedOrigins: ['https://internal.example.com'],
    telemetry: { mode: 'buyer_managed', destinationRef: 'telemetry://customer/primary' },
    evidence: { retentionMode: 'buyer_managed', destinationRef: 'evidence://customer/archive' },
  })
  assert.equal(result.valid, true)
  assert.equal(result.configuration?.telemetry.destinationRef, 'telemetry://customer/primary')
  assert.equal(result.configuration?.evidence.destinationRef, 'evidence://customer/archive')
})

test('rejects missing, forbidden, or unsafe destination references', () => {
  const missing = validatePortableBrowserBuyerConfiguration({
    ...validConfiguration(),
    telemetry: { mode: 'buyer_managed' },
    evidence: { retentionMode: 'buyer_managed' },
  })
  assert.ok(missing.errors.includes('telemetry_destination_ref_required'))
  assert.ok(missing.errors.includes('evidence_destination_ref_required'))

  const forbidden = validatePortableBrowserBuyerConfiguration({
    ...validConfiguration(),
    telemetry: { mode: 'disabled', destinationRef: 'telemetry://unexpected' },
    evidence: { retentionMode: 'memory', destinationRef: 'evidence://unexpected' },
  })
  assert.ok(forbidden.errors.includes('telemetry_destination_ref_forbidden'))
  assert.ok(forbidden.errors.includes('evidence_destination_ref_forbidden'))

  const unsafe = validatePortableBrowserBuyerConfiguration({
    ...validConfiguration(),
    deploymentMode: 'self_hosted',
    telemetry: { mode: 'buyer_managed', destinationRef: 'telemetry://ok\nsecret' },
  })
  assert.ok(unsafe.errors.includes('telemetry_destination_ref_invalid'))
})

test('enforces bounded lifecycle limits and cleanup capacity', () => {
  const result = validatePortableBrowserBuyerConfiguration({
    ...validConfiguration(),
    lifecycle: {
      maxConcurrentSessions: 2,
      maxSessionAgeMs: 999,
      cleanupBatchSize: 3,
    },
  })
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('max_session_age_invalid'))
  assert.ok(result.errors.includes('cleanup_batch_exceeds_capacity'))
})

test('rejects duplicate origins, unknown fields, malformed provider ids, and embedded URL credentials', () => {
  const result = validatePortableBrowserBuyerConfiguration({
    ...validConfiguration(),
    extra: true,
    providerId: 'Invalid Provider',
    approvedOrigins: [
      'http://localhost:4173',
      'http://localhost:4173',
      'http://user:password@localhost:4173',
    ],
  })
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('unknown_configuration_field'))
  assert.ok(result.errors.includes('provider_id_invalid'))
  assert.ok(result.errors.includes('duplicate_approved_origin'))
  assert.ok(result.errors.includes('approved_origin_invalid'))
})

test('rejects unsupported schema versions and non-object input', () => {
  assert.deepEqual(validatePortableBrowserBuyerConfiguration(null).errors, ['configuration_object_required'])
  const result = validatePortableBrowserBuyerConfiguration({ ...validConfiguration(), schemaVersion: '2.0.0' })
  assert.deepEqual(result.errors, ['unsupported_schema_version'])
})
