import assert from 'node:assert/strict'
import test from 'node:test'

import { validateAndroidBuildEvidence } from '../portable-mobile/android-build-evidence.ts'
import { createAndroidPublicationReadiness } from '../portable-mobile/android-publication-readiness.ts'

function validatedBuildEvidence() {
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
    buildStartedAt: '2026-07-26T03:00:00.000Z',
    buildCompletedAt: '2026-07-26T03:05:00.000Z',
    artifactSigned: false,
    artifactUploaded: false,
    playConsolePublished: false,
    productionExecutionEnabled: false,
  })
}

const references = {
  releaseSigningEvidenceRef: 'vault-ref://android/release-signing',
  dataSafetyEvidenceRef: 'evidence://play/data-safety',
  contentRatingEvidenceRef: 'evidence://play/content-rating',
  privacyPolicyEvidenceRef: 'https://signalboostapp.com/privacy',
  supportContactEvidenceRef: 'evidence://support/provider-hub',
  storeListingEvidenceRef: 'evidence://play/store-listing',
  deviceTestingEvidenceRef: 'evidence://android/device-testing',
} as const

test('creates deterministic immutable publication readiness metadata', () => {
  const input = {
    buildEvidence: validatedBuildEvidence(),
    ...references,
    artifactAccessed: false,
    signingExecuted: false,
    storeSubmissionExecuted: false,
    productionPublished: false,
    productionExecutionEnabled: false,
  } as const
  const first = createAndroidPublicationReadiness(input)
  const second = createAndroidPublicationReadiness(input)

  assert.deepEqual(first, second)
  assert.equal(first.state, 'publication_ready')
  assert.deepEqual(first.blockers, [])
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.blockers))
  assert.ok(Object.isFrozen(first.evidenceReferences))
  assert.deepEqual(Object.keys(first.evidenceReferences), [...Object.keys(first.evidenceReferences)].sort())
})

test('fails closed with deterministic missing-evidence blockers', () => {
  const result = createAndroidPublicationReadiness({
    buildEvidence: validatedBuildEvidence(),
    artifactAccessed: false,
    signingExecuted: false,
    storeSubmissionExecuted: false,
    productionPublished: false,
    productionExecutionEnabled: false,
  })

  assert.equal(result.state, 'blocked')
  assert.deepEqual(result.blockers, [
    'release-signing-evidence',
    'data-safety-evidence',
    'content-rating-evidence',
    'privacy-policy-evidence',
    'support-contact-evidence',
    'store-listing-evidence',
    'device-testing-evidence',
  ])
})

test('rejects unsafe state and credential-shaped references', () => {
  const result = createAndroidPublicationReadiness({
    buildEvidence: validatedBuildEvidence(),
    ...references,
    releaseSigningEvidenceRef: 'https://user:secret@example.com/signing',
    artifactAccessed: false,
    signingExecuted: true,
    storeSubmissionExecuted: false,
    productionPublished: false,
    productionExecutionEnabled: false,
  } as never)

  assert.equal(result.state, 'blocked')
  assert.deepEqual(result.blockers, ['release-signing-evidence', 'unsafe-state'])
  assert.equal('releaseSigning' in result.evidenceReferences, false)
})

test('blocks non-validated build evidence', () => {
  const evidence = { ...validatedBuildEvidence(), state: 'blocked', blockers: ['unsafe-state'] }
  const result = createAndroidPublicationReadiness({
    buildEvidence: evidence,
    ...references,
    artifactAccessed: false,
    signingExecuted: false,
    storeSubmissionExecuted: false,
    productionPublished: false,
    productionExecutionEnabled: false,
  } as never)

  assert.deepEqual(result.blockers, ['build-evidence'])
})
