import assert from 'node:assert/strict'
import test from 'node:test'

import { portablePackageManifestSchemaVersion, validatePortablePackageManifest } from '../lib/portable-products/package-manifest.ts'

const validInput = {
  portableId: 'provider-hub',
  version: '1.0.0',
  sourceCommitSha: 'a'.repeat(40),
  artifactName: 'provider-hub-1.0.0.tgz',
  mediaType: 'application/gzip',
  sha256: 'b'.repeat(64),
  sizeBytes: 1024,
  dependencies: ['provider-hub-core', 'provider-hub-host'],
  installationReference: 'https://docs.example.com/provider-hub/install',
  configurationReference: 'https://docs.example.com/provider-hub/configure',
  recoveryReference: 'https://docs.example.com/provider-hub/recovery',
  supportReference: 'https://support.example.com/provider-hub',
  credentialsIncluded: false,
  entitlementActivated: false,
  deploymentPerformed: false,
  providerExecutionEnabled: false,
  productionExecutionEnabled: false,
}

test('portable package manifest validates a registered, integrity-bound, read-only package', () => {
  const result = validatePortablePackageManifest(validInput)
  assert.equal(result.schemaVersion, portablePackageManifestSchemaVersion)
  assert.equal(result.state, 'package_manifest_validated')
  assert.deepEqual(result.blockers, [])
  assert.deepEqual(result.dependencies, ['provider-hub-core', 'provider-hub-host'])
  assert.equal(result.readOnly, true)
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.dependencies))
  assert.ok(Object.isFrozen(result.references))
})

test('portable package manifest fails closed for unknown products and unsafe state', () => {
  const result = validatePortablePackageManifest({
    ...validInput,
    portableId: 'unknown-product',
    credentialsIncluded: true,
    entitlementActivated: true,
    deploymentPerformed: true,
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.blockers.includes('identity'))
  assert.ok(result.blockers.includes('unsafe-state'))
  assert.equal(result.credentialsIncluded, false)
  assert.equal(result.entitlementActivated, false)
  assert.equal(result.deploymentPerformed, false)
})

test('portable package manifest rejects malformed integrity and references', () => {
  const result = validatePortablePackageManifest({
    ...validInput,
    sha256: 'bad',
    sizeBytes: 0,
    installationReference: 'https://user@example.com/secret?token=value',
    dependencies: ['valid', 'valid'],
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.blockers.includes('integrity'))
  assert.ok(result.blockers.includes('references'))
  assert.ok(result.blockers.includes('dependencies'))
})
