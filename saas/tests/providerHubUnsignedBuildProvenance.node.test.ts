import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { createProviderHubUnsignedBuildProvenance } from '../portable-mobile/provider-hub-unsigned-build-provenance.ts'

const digest = 'a'.repeat(64)
const valid = {
  sourceCommitSha: 'b'.repeat(40),
  packageName: 'com.signalboost.providerhub',
  scaffoldSchemaVersion: 'signalboost-android-scaffold-v1',
  buildPlanSchemaVersion: 'signalboost-android-build-plan-v1',
  assetDigests: {
    manifest: digest,
    serviceWorker: digest,
    offlinePage: digest,
    icon: digest,
    maskableIcon: digest,
    assetLinksTemplate: digest,
  },
  toolchain: { jdk: '17.0.12', androidSdk: '35', gradle: '8.9', androidGradlePlugin: '8.7.3' },
  lintPassed: true,
  testsPassed: true,
  unsignedAabPath: 'app/build/outputs/bundle/release/app-release.aab',
  unsignedAabSha256: 'c'.repeat(64),
  artifactSigned: false,
  artifactUploaded: false,
  playConsolePublished: false,
  productionExecutionEnabled: false,
} as const

test('validates deterministic immutable unsigned Provider Hub build provenance', () => {
  const first = createProviderHubUnsignedBuildProvenance(valid)
  const second = createProviderHubUnsignedBuildProvenance(valid)
  assert.deepEqual(first, second)
  assert.equal(first.state, 'validated')
  assert.equal(first.packageName, 'com.signalboost.providerhub')
  assert.equal(first.signingEnabled, false)
  assert.equal(first.uploadEnabled, false)
  assert.equal(first.publicationEnabled, false)
  assert.equal(first.buildExecuted, false)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.blockers))
})

test('fails closed for identity, evidence, traversal, and unsafe claims', () => {
  const blocked = createProviderHubUnsignedBuildProvenance({
    ...valid,
    packageName: 'com.example.other',
    assetDigests: { ...valid.assetDigests, unexpected: digest } as typeof valid.assetDigests,
    lintPassed: false,
    testsPassed: false,
    unsignedAabPath: '../app-release.aab',
    artifactSigned: true,
  })
  assert.equal(blocked.state, 'blocked')
  assert.deepEqual(blocked.blockers, ['artifact-path', 'asset-digests', 'lint', 'package-identity', 'tests', 'unsafe-state'])
})

test('validator has no build, filesystem, signing, network, or store mutation capability', async () => {
  const source = await readFile(new URL('../portable-mobile/provider-hub-unsigned-build-provenance.ts', import.meta.url), 'utf8')
  for (const forbidden of ['node:fs', 'child_process', 'fetch(', 'exec(', 'spawn(', 'gradlew', 'signingConfigs', 'androidpublisher', 'process.env']) {
    assert.equal(source.includes(forbidden), false, `source must not contain ${forbidden}`)
  }
})
