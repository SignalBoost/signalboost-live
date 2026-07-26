import assert from 'node:assert/strict'
import test from 'node:test'

import { validateAndroidBuildEvidence } from '../portable-mobile/android-build-evidence.ts'
import { validateAndroidSignedBundleEvidence } from '../portable-mobile/android-signed-bundle-evidence.ts'
import { createAndroidPublicationReadiness } from '../portable-mobile/android-publication-readiness.ts'
import { createAndroidPlayConsoleReleaseEvidence } from '../portable-mobile/android-play-console-release-evidence.ts'

function signedEvidence() {
  const build = validateAndroidBuildEvidence({
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
  return validateAndroidSignedBundleEvidence(build, {
    portableId: 'provider-hub',
    packageName: 'com.signalboost.providerhub',
    unsignedAabSha256: 'b'.repeat(64),
    signedAabPath: 'release/provider-hub-signed.aab',
    signedAabSha256: 'c'.repeat(64),
    certificateSha256Fingerprint: Array(32).fill('AB').join(':'),
    signingKeyReference: 'vault-ref://android/provider-hub/release-v1',
    signerAttestationReference: 'evidence://provider-hub/signing-attestation-001',
    signingStartedAt: '2026-07-26T04:10:00.000Z',
    signingCompletedAt: '2026-07-26T04:11:00.000Z',
    artifactUploaded: false,
    playConsolePublished: false,
    productionExecutionEnabled: false,
  })
}

function publicationReadiness() {
  const build = validateAndroidBuildEvidence({
    portableId: 'provider-hub', packageName: 'com.signalboost.providerhub',
    scaffoldSchemaVersion: 'signalboost-android-scaffold-v1', buildPlanSchemaVersion: 'signalboost-android-build-plan-v1',
    sourceCommitSha: 'a'.repeat(40), jdkVersion: '17', androidSdkVersion: '35', gradleVersion: '8.10.2',
    lintPassed: true, testsPassed: true, unsignedAabPath: 'app-release.aab', unsignedAabSha256: 'b'.repeat(64),
    buildStartedAt: '2026-07-26T04:00:00.000Z', buildCompletedAt: '2026-07-26T04:05:00.000Z',
    artifactSigned: false, artifactUploaded: false, playConsolePublished: false, productionExecutionEnabled: false,
  })
  return createAndroidPublicationReadiness({
    buildEvidence: build,
    releaseSigningEvidenceRef: 'evidence://play/release-signing', dataSafetyEvidenceRef: 'evidence://play/data-safety',
    contentRatingEvidenceRef: 'evidence://play/content-rating', privacyPolicyEvidenceRef: 'https://signalboostapp.com/privacy',
    supportContactEvidenceRef: 'evidence://support/provider-hub', storeListingEvidenceRef: 'evidence://play/store-listing',
    deviceTestingEvidenceRef: 'evidence://android/device-testing', artifactAccessed: false, signingExecuted: false,
    storeSubmissionExecuted: false, productionPublished: false, productionExecutionEnabled: false,
  })
}

const references = {
  internalTestingEvidenceRef: 'evidence://play/internal-testing',
  closedTestingEvidenceRef: 'evidence://play/closed-testing',
  openTestingEvidenceRef: 'evidence://play/open-testing',
  rolloutEligibilityEvidenceRef: 'evidence://play/rollout-eligibility',
} as const

const safeFlags = {
  artifactAccessed: false, artifactUploaded: false, playConsoleApiCalled: false,
  releaseCreated: false, rolloutStarted: false, productionPublished: false, productionExecutionEnabled: false,
} as const

test('creates deterministic immutable Play Console release evidence', () => {
  const input = { signedBundleEvidence: signedEvidence(), publicationReadiness: publicationReadiness(), ...references, ...safeFlags }
  const first = createAndroidPlayConsoleReleaseEvidence(input)
  const second = createAndroidPlayConsoleReleaseEvidence(input)
  assert.deepEqual(first, second)
  assert.equal(first.state, 'release_evidence_ready')
  assert.equal(first.rolloutEligible, true)
  assert.deepEqual(first.blockers, [])
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.blockers))
  assert.ok(Object.isFrozen(first.evidenceReferences))
})

test('fails closed for malformed input and exact-false safety flags', () => {
  assert.doesNotThrow(() => createAndroidPlayConsoleReleaseEvidence(null))
  const malformed = createAndroidPlayConsoleReleaseEvidence(null)
  assert.equal(malformed.state, 'blocked')
  assert.ok(malformed.blockers.includes('unsafe-state'))

  const unsafe = createAndroidPlayConsoleReleaseEvidence({
    signedBundleEvidence: signedEvidence(), publicationReadiness: publicationReadiness(), ...references, ...safeFlags,
    artifactUploaded: undefined,
  })
  assert.deepEqual(unsafe.blockers, ['unsafe-state'])
})

test('reports deterministic missing evidence blockers', () => {
  const result = createAndroidPlayConsoleReleaseEvidence({
    signedBundleEvidence: signedEvidence(), publicationReadiness: publicationReadiness(), ...safeFlags,
  })
  assert.deepEqual(result.blockers, [
    'internal-testing-evidence', 'closed-testing-evidence', 'open-testing-evidence', 'rollout-eligibility-evidence',
  ])
  assert.equal(result.rolloutEligible, false)
})

test('blocks identity mismatch and credential-shaped references', () => {
  const readiness = { ...publicationReadiness(), packageName: 'com.signalboost.other' }
  const result = createAndroidPlayConsoleReleaseEvidence({
    signedBundleEvidence: signedEvidence(), publicationReadiness: readiness,
    ...references, rolloutEligibilityEvidenceRef: 'https://user:secret@example.com/rollout', ...safeFlags,
  })
  assert.deepEqual(result.blockers, ['identity', 'rollout-eligibility-evidence'])
})
