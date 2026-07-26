import assert from 'node:assert/strict'
import test from 'node:test'

import { createPortableBuyerHandoffManifest } from '../lib/portable-products/buyer-handoff-manifest.ts'

const sha = 'a'.repeat(64)
const artifacts = ['package', 'integrity', 'installation', 'configuration', 'operations', 'acceptance', 'support'].map(kind => ({
  kind: kind as 'package' | 'integrity' | 'installation' | 'configuration' | 'operations' | 'acceptance' | 'support',
  path: `artifacts/${kind}.json`,
  sha256: sha,
  required: true,
}))

function validInput() {
  return {
    productId: 'provider-hub',
    releaseVersion: '1.0.0',
    packageFormat: 'application/zip',
    artifacts,
    buyerResponsibilities: ['operate buyer infrastructure'],
    supplierResponsibilities: ['provide package and support boundary'],
    exclusions: ['no credential transfer'],
    preparedAt: '2026-07-26T20:00:00.000Z',
    acknowledgedAt: '2026-07-26T20:01:00.000Z',
    artifactTransferred: false,
    credentialsTransferred: false,
    entitlementMutated: false,
    deploymentPerformed: false,
    productionExecutionEnabled: false,
  } as const
}

test('validates a complete read-only buyer fulfillment handoff', () => {
  const manifest = createPortableBuyerHandoffManifest(validInput())
  assert.equal(manifest.complete, true)
  assert.deepEqual(manifest.blockers, [])
  assert.equal(manifest.readOnly, true)
  assert.equal(manifest.artifactTransferred, false)
  assert.ok(Object.isFrozen(manifest))
  assert.ok(Object.isFrozen(manifest.artifacts))
})

test('fails closed for unknown products, unsafe paths, duplicates, timestamps, and mutation state', () => {
  const input = validInput()
  const manifest = createPortableBuyerHandoffManifest({
    ...input,
    productId: 'unknown-product',
    artifacts: [...input.artifacts, { ...input.artifacts[0], path: '../secret-token' }],
    acknowledgedAt: '2026-07-26T19:00:00.000Z',
    credentialsTransferred: true,
  })
  assert.equal(manifest.complete, false)
  assert.ok(manifest.blockers.includes('unregistered-product-id'))
  assert.ok(manifest.blockers.includes('duplicate-artifact-kind'))
  assert.ok(manifest.blockers.includes('unsafe-path:package'))
  assert.ok(manifest.blockers.includes('invalid-timestamps'))
  assert.ok(manifest.blockers.includes('unsafe-state'))
  assert.equal(manifest.credentialsTransferred, false)
})
