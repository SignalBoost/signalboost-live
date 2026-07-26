import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { createProviderHubUnsignedBuildEvidenceBundle } from '../portable-mobile/provider-hub-unsigned-build-evidence-bundle.ts'

function fnv1a(value: unknown): string {
  function canonical(input: unknown): string {
    if (Array.isArray(input)) return `[${input.map(canonical).join(',')}]`
    if (input && typeof input === 'object') {
      const record = input as Record<string, unknown>
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
    }
    return JSON.stringify(input)
  }
  let hash = 0x811c9dc5
  for (const char of canonical(value)) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

const hash = (character: string) => character.repeat(64)
const assetDigests = {
  manifest: hash('a'),
  serviceWorker: hash('b'),
  offlinePage: hash('c'),
  icon: hash('d'),
  maskableIcon: hash('e'),
  assetLinksTemplate: hash('f'),
} as const
const dependencyReviewId = 'dependency-review-1234abcd'
const buildLogDigest = hash('1')
const dependencyLockDigest = hash('2')
const unsignedAabSha256 = hash('3')

const valid = {
  sourceCommitSha: '4'.repeat(40),
  packageName: 'com.signalboost.providerhub',
  scaffoldSchemaVersion: 'signalboost-android-scaffold-v1',
  buildPlanSchemaVersion: 'signalboost-android-build-plan-v1',
  provenanceSchemaVersion: 'signalboost-provider-hub-unsigned-build-provenance-v1',
  dependencyReviewSchemaVersion: 'signalboost-provider-hub-dependency-review-v1',
  dependencyReviewId,
  assetDigests,
  toolchain: {
    jdk: '17.0.12',
    androidSdk: '35.0.0',
    gradle: '8.10.2',
    androidGradlePlugin: '8.7.3',
    androidBrowserHelper: '2.6.2',
  },
  lintPassed: true,
  testsPassed: true,
  unsignedAabPath: 'artifacts/provider-hub-release-unsigned.aab',
  unsignedAabSha256,
  buildLogDigest,
  dependencyLockDigest,
  evidenceIndex: [
    { key: 'assets', digest: fnv1a(assetDigests).padEnd(64, '0') },
    { key: 'build-log', digest: buildLogDigest },
    { key: 'dependency-lock', digest: dependencyLockDigest },
    { key: 'dependency-review', digest: fnv1a({ schemaVersion: 'signalboost-provider-hub-dependency-review-v1', reviewId: dependencyReviewId }).padEnd(64, '0') },
    { key: 'unsigned-aab', digest: unsignedAabSha256 },
  ],
  signingEnabled: false,
  artifactUploaded: false,
  playConsolePublished: false,
  productionExecutionEnabled: false,
} as const

test('creates deterministic immutable unsigned build evidence metadata', () => {
  const first = createProviderHubUnsignedBuildEvidenceBundle(valid)
  const second = createProviderHubUnsignedBuildEvidenceBundle({ ...valid, evidenceIndex: [...valid.evidenceIndex].reverse() })
  assert.equal(first.state, 'evidence_ready')
  assert.deepEqual(first.blockers, [])
  assert.equal(first.evidenceId, second.evidenceId)
  assert.match(first.evidenceId, /^provider-hub:unsigned-build-evidence:[a-f0-9]{8}$/)
  assert.deepEqual(first.evidenceIndex.map(({ key }) => key), ['assets', 'build-log', 'dependency-lock', 'dependency-review', 'unsigned-aab'])
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.blockers))
  assert.ok(Object.isFrozen(first.evidenceIndex))
  assert.ok(first.evidenceIndex.every(Object.isFrozen))
  assert.equal(first.filesystemAccessed, false)
  assert.equal(first.networkAccessed, false)
  assert.equal(first.buildExecuted, false)
  assert.equal(first.dependencyResolutionPerformed, false)
  assert.equal(first.signingEnabled, false)
  assert.equal(first.uploadEnabled, false)
  assert.equal(first.publicationEnabled, false)
  assert.equal(first.productionExecutionEnabled, false)
})

test('fails closed for missing, mismatched, malformed, duplicate, unknown, traversal, credential, and unsafe evidence', () => {
  const report = createProviderHubUnsignedBuildEvidenceBundle({
    ...valid,
    packageName: 'com.example.providerhub',
    sourceCommitSha: 'bad',
    buildPlanSchemaVersion: 'wrong',
    dependencyReviewId: 'latest',
    unsignedAabPath: '../token/provider-hub.aab',
    unsignedAabSha256: 'bad',
    buildLogDigest: 'bad',
    evidenceIndex: [
      { key: 'assets', digest: hash('a') },
      { key: 'assets', digest: hash('b') },
      { key: 'unknown', digest: hash('c') },
    ],
    signingEnabled: true,
    artifactUploaded: true,
  } as typeof valid)
  assert.equal(report.state, 'blocked')
  assert.deepEqual(report.blockers, [
    'artifact-digest',
    'artifact-path',
    'build-log-digest',
    'build-plan-schema',
    'credential-shaped-value',
    'dependency-review-identity',
    'evidence-index',
    'package-identity',
    'source-commit',
    'unsafe-state',
  ])
})

test('rejects unknown top-level keys and evidence integrity mismatches', () => {
  const report = createProviderHubUnsignedBuildEvidenceBundle({
    ...valid,
    unexpected: true,
    evidenceIndex: valid.evidenceIndex.map((entry) => entry.key === 'unsigned-aab' ? { ...entry, digest: hash('9') } : entry),
  } as typeof valid)
  assert.equal(report.state, 'blocked')
  assert.deepEqual(report.blockers, ['evidence-integrity', 'input-keys'])
})

test('source contains no filesystem, network, Gradle, signing, upload, publication, or production execution capability', async () => {
  const source = await readFile(new URL('../portable-mobile/provider-hub-unsigned-build-evidence-bundle.ts', import.meta.url), 'utf8')
  for (const forbidden of ["from 'node:fs'", "from 'node:child_process'", 'fetch(', 'exec(', 'spawn(', 'gradlew', 'signingConfigs', 'androidpublisher']) {
    assert.equal(source.includes(forbidden), false, `evidence bundle must not contain ${forbidden}`)
  }
})
