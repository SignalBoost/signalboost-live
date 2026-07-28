// saas/tests/providerHubUnsignedBuildProvenance.node.test.ts
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { createProviderHubUnsignedBuildProvenance } from '../portable-mobile/provider-hub-unsigned-build-provenance.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


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
  toolchain: { jdk: '17.0.12', androidSdk: '35', gradle: '8.10.2', androidGradlePlugin: '8.7.3' },
  lintPassed: true,
  testsPassed: true,
  unsignedAabPath: 'app/build/outputs/bundle/release/app-release.aab',
  unsignedAabSha256: 'c'.repeat(64),
  artifactSigned: false,
  artifactUploaded: false,
  playConsolePublished: false,
  productionExecutionEnabled: false,
} as const

test('creates deterministic immutable Provider Hub unsigned build provenance', () => {
  const first = createProviderHubUnsignedBuildProvenance(valid)
  const second = createProviderHubUnsignedBuildProvenance(valid)
  assert.deepEqual(first, second)
  assert.equal(first.state, 'validated')
  assert.deepEqual(first.blockers, [])
  assert.equal(first.sourceCommitSha, valid.sourceCommitSha)
  assert.equal(first.packageName, 'com.signalboost.providerhub')
  assert.equal(first.unsignedAabPath, valid.unsignedAabPath)
  assert.equal(first.unsignedAabSha256, valid.unsignedAabSha256)
  assert.equal(first.buildExecuted, false)
  assert.equal(first.signingEnabled, false)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.blockers))
})

test('fails closed for identity, exact asset inventory, missing checks, traversal, and unsafe claims', () => {
  const report = createProviderHubUnsignedBuildProvenance({
    ...valid,
    packageName: 'com.example.other',
    assetDigests: { ...valid.assetDigests, unexpected: digest } as typeof valid.assetDigests,
    lintPassed: false,
    testsPassed: false,
    unsignedAabPath: '../app-release.aab',
    artifactSigned: true,
  })
  assert.equal(report.state, 'blocked')
  assert.deepEqual(report.blockers, ['artifact-path', 'asset-digests', 'lint', 'package-identity', 'tests', 'unsafe-state'])
})

test('provenance contract has no build, artifact, signing, network, or store capability', async () => {
  const source = await readFile(new URL('../portable-mobile/provider-hub-unsigned-build-provenance.ts', import.meta.url), 'utf8').then(hydrateLocalizedSource)
  for (const forbidden of ["from 'node:fs'", "from 'node:child_process'", 'readFile(', 'writeFile(', 'exec(', 'spawn(', 'fetch(', 'gradlew', 'signingConfigs', 'play.googleapis.com', 'process.env']) {
    assert.equal(source.includes(forbidden), false, `provenance contract must not contain ${forbidden}`)
  }
})
