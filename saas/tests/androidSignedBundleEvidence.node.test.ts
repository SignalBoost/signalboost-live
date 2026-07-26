import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { validateAndroidBuildEvidence } from '../portable-mobile/android-build-evidence.ts'
import { validateAndroidSignedBundleEvidence } from '../portable-mobile/android-signed-bundle-evidence.ts'

const buildEvidence = validateAndroidBuildEvidence({
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

const input = {
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
}

test('validates deterministic Provider Hub signed bundle evidence metadata', () => {
  const report = validateAndroidSignedBundleEvidence(buildEvidence, input)
  assert.equal(report.state, 'signed_bundle_evidence_validated')
  assert.deepEqual(report.blockers, [])
  assert.equal(report.artifactAccessed, false)
  assert.equal(report.signingPerformed, false)
  assert.equal(report.rawSigningMaterialAccepted, false)
  assert.equal(report.storeSubmissionEnabled, false)
  assert.ok(Object.isFrozen(report))
  assert.ok(Object.isFrozen(report.blockers))
})

test('fails closed for malformed, unsafe, uploaded, or mismatched evidence', () => {
  const report = validateAndroidSignedBundleEvidence(buildEvidence, {
    ...input,
    packageName: 'com.signalboost.other',
    signedAabSha256: input.unsignedAabSha256,
    certificateSha256Fingerprint: 'bad',
    signingKeyReference: 'release.keystore password=secret',
    artifactUploaded: true,
  })
  assert.deepEqual(report.blockers, [
    'identity',
    'digest-linkage',
    'certificate-fingerprint',
    'unsafe-material',
    'unsafe-state',
  ])
})

test('signed bundle evidence source has no access, execution, or mutation capability', async () => {
  const source = await readFile(new URL('../portable-mobile/android-signed-bundle-evidence.ts', import.meta.url), 'utf8')
  for (const forbidden of ["from 'node:child_process'", "from 'node:fs'", 'exec(', 'spawn(', 'fetch(', 'readFile(', 'writeFile(', 'signingConfigs', 'playConsole']) {
    assert.equal(source.includes(forbidden), false, `signed evidence contract must not contain ${forbidden}`)
  }
})
