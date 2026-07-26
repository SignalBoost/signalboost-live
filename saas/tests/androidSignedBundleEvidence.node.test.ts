import assert from 'node:assert/strict'
import test from 'node:test'

import { validateAndroidBuildEvidence } from '../portable-mobile/android-build-evidence.ts'
import { validateAndroidSignedBundleEvidence } from '../portable-mobile/android-signed-bundle-evidence.ts'

function buildEvidence() {
  return validateAndroidBuildEvidence({
    portableId: 'provider-hub',
    packageName: 'com.signalboost.providerhub',
    scaffoldSchemaVersion: 'signalboost-android-scaffold-v1',
    buildPlanSchemaVersion: 'signalboost-android-build-plan-v1',
    sourceCommitSha: 'a'.repeat(40),
    jdkVersion: '17.0.12',
    androidSdkVersion: '35',
    gradleVersion: '8.10.2',
    lintPassed: true,
    testsPassed: true,
    unsignedAabPath: 'app/build/outputs/bundle/release/app-release.aab',
    unsignedAabSha256: 'b'.repeat(64),
    buildStartedAt: '2026-07-26T04:00:00.000Z',
    buildCompletedAt: '2026-07-26T04:05:00.000Z',
    artifactSigned: false,
    artifactUploaded: false,
    playConsolePublished: false,
    productionExecutionEnabled: false,
  })
}

const validInput = {
  portableId: 'provider-hub',
  packageName: 'com.signalboost.providerhub',
  unsignedAabSha256: 'b'.repeat(64),
  signedAabPath: 'release/provider-hub-signed.aab',
  signedAabSha256: 'c'.repeat(64),
  certificateSha256Fingerprint: Array(32).fill('AB').join(':'),
  signingKeyReference: 'vault-ref:android/provider-hub/release-v1',
  signerAttestationReference: 'evidence:provider-hub/signing-attestation-001',
  signingStartedAt: '2026-07-26T04:10:00.000Z',
  signingCompletedAt: '2026-07-26T04:11:00.000Z',
  artifactUploaded: false,
  playConsolePublished: false,
  productionExecutionEnabled: false,
} as const

test('validates linked immutable signed bundle evidence metadata', () => {
  const report = validateAndroidSignedBundleEvidence(buildEvidence(), validInput)
  assert.equal(report.state, 'signed_bundle_evidence_validated')
  assert.deepEqual(report.blockers, [])
  assert.equal(report.sourceCommitSha, 'a'.repeat(40))
  assert.equal(report.signedAabSha256, 'c'.repeat(64))
  assert.ok(Object.isFrozen(report))
  assert.ok(Object.isFrozen(report.blockers))
})

test('fails closed for malformed input without throwing', () => {
  assert.doesNotThrow(() => validateAndroidSignedBundleEvidence(null, null))
  const report = validateAndroidSignedBundleEvidence(null, null)
  assert.equal(report.state, 'blocked')
  assert.ok(report.blockers.includes('build-evidence'))
  assert.ok(report.blockers.includes('unsafe-state'))
})

test('requires exact false safety flags and digest linkage', () => {
  const report = validateAndroidSignedBundleEvidence(buildEvidence(), {
    ...validInput,
    unsignedAabSha256: 'd'.repeat(64),
    artifactUploaded: undefined,
  })
  assert.ok(report.blockers.includes('digest-linkage'))
  assert.ok(report.blockers.includes('unsafe-state'))
})

test('rejects unsafe material, paths, and reused digests', () => {
  const report = validateAndroidSignedBundleEvidence(buildEvidence(), {
    ...validInput,
    signedAabPath: '../release.aab',
    signedAabSha256: validInput.unsignedAabSha256,
    signingKeyReference: 'release.keystore password=secret',
  })
  assert.deepEqual(report.blockers, [
    'artifact-path',
    'digest-linkage',
    'signing-reference',
    'unsafe-material',
  ])
})
