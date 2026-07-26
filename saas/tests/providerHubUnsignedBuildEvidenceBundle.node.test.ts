// saas/tests/providerHubUnsignedBuildEvidenceBundle.node.test.ts

import assert from 'node:assert/strict'
import test from 'node:test'

import { createProviderHubUnsignedBuildEvidenceBundle } from '../portable-mobile/provider-hub-unsigned-build-evidence-bundle.ts'

const safeInput = {
  sourceCommitSha: 'a'.repeat(40),
  packageName: 'com.signalboost.providerhub',
  scaffoldSchemaVersion: 'signalboost-android-scaffold-v1',
  buildPlanSchemaVersion: 'signalboost-android-build-plan-v1',
  provenanceSchemaVersion: 'signalboost-provider-hub-unsigned-build-provenance-v1',
  dependencyReview: {
    schemaVersion: 'signalboost-provider-hub-dependency-review-v1',
    reviewId: 'dependency-review-1234abcd',
    state: 'review_ready',
    packageName: 'com.signalboost.providerhub',
    portableId: 'provider-hub',
    blockers: [],
  },
  assetDigests: {
    assetLinksTemplate: '1'.repeat(64),
    icon: '2'.repeat(64),
    manifest: '3'.repeat(64),
    maskableIcon: '4'.repeat(64),
    offlinePage: '5'.repeat(64),
    serviceWorker: '6'.repeat(64),
  },
  toolchain: {
    jdk: '21.0.4',
    androidSdk: '35.0.0',
    gradle: '8.10.2',
    androidGradlePlugin: '8.7.2',
    androidBrowserHelper: '2.6.2',
  },
  repositories: ['google', 'mavenCentral'],
  lintPassed: true,
  testsPassed: true,
  unsignedAabPath: 'artifacts/provider-hub-unsigned.aab',
  unsignedAabSha256: '7'.repeat(64),
  buildLogDigest: '8'.repeat(64),
  dependencyLockDigest: '9'.repeat(64),
  evidence: {
    buildLog: 'a'.repeat(64),
    dependencyLock: 'b'.repeat(64),
    provenance: 'c'.repeat(64),
  },
  signingEnabled: false,
  uploadEnabled: false,
  publicationEnabled: false,
  productionExecutionEnabled: false,
} as const

test('creates deterministic immutable Provider Hub unsigned build evidence', () => {
  const first = createProviderHubUnsignedBuildEvidenceBundle(safeInput)
  const second = createProviderHubUnsignedBuildEvidenceBundle(safeInput)
  assert.deepEqual(first, second)
  assert.equal(first.state, 'evidence_ready')
  assert.deepEqual(first.blockers, [])
  assert.match(first.evidenceId, /^provider-hub:unsigned-build-evidence:[0-9a-f]{8}$/)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.blockers))
  assert.ok(Object.isFrozen(first.evidence))
  assert.equal(first.filesystemAccessed, false)
  assert.equal(first.networkAccessed, false)
  assert.equal(first.buildExecuted, false)
})

test('fails closed for identity, schema, digest, traversal, and unsafe claims', () => {
  const result = createProviderHubUnsignedBuildEvidenceBundle({
    ...safeInput,
    packageName: 'com.signalboost.other',
    scaffoldSchemaVersion: 'wrong',
    unsignedAabPath: '../escape.aab',
    unsignedAabSha256: 'bad',
    signingEnabled: true,
  })
  assert.equal(result.state, 'blocked')
  assert.deepEqual(result.blockers, ['artifact-path', 'digests', 'package-identity', 'schema-identity', 'unsafe-state'])
})

test('rejects unknown keys, dynamic toolchains, repositories, credentials, and malformed evidence', () => {
  const result = createProviderHubUnsignedBuildEvidenceBundle({
    ...safeInput,
    extra: true,
    toolchain: { ...safeInput.toolchain, gradle: 'latest' },
    repositories: ['google', 'https://user:token@example.com/repo'],
    evidence: { buildLog: 'not-a-hash' },
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.blockers.includes('evidence-keys'))
  assert.ok(result.blockers.includes('toolchain'))
  assert.ok(result.blockers.includes('repositories'))
  assert.ok(result.blockers.includes('evidence-index'))
  assert.ok(result.blockers.includes('credential-shaped-value'))
})
