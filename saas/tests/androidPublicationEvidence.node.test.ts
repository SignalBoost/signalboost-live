import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { validateAndroidBuildEvidence } from '../portable-mobile/android-build-evidence.ts'
import { createAndroidPublicationReadiness } from '../portable-mobile/android-publication-readiness.ts'
import { validateAndroidPublicationEvidence } from '../portable-mobile/android-publication-evidence.ts'
import { validateAndroidSignedBundleEvidence } from '../portable-mobile/android-signed-bundle-evidence.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const build = validateAndroidBuildEvidence({
  portableId: 'provider-hub', packageName: 'com.signalboost.providerhub', scaffoldSchemaVersion: 'signalboost-android-scaffold-v1', buildPlanSchemaVersion: 'signalboost-android-build-plan-v1', sourceCommitSha: 'a'.repeat(40), jdkVersion: '17.0.12', androidSdkVersion: '35', gradleVersion: '8.10.2', lintPassed: true, testsPassed: true, unsignedAabPath: 'app/build/outputs/bundle/release/app-release.aab', unsignedAabSha256: 'b'.repeat(64), buildStartedAt: '2026-07-26T04:00:00.000Z', buildCompletedAt: '2026-07-26T04:05:00.000Z', artifactSigned: false, artifactUploaded: false, playConsolePublished: false, productionExecutionEnabled: false,
})

const signed = validateAndroidSignedBundleEvidence(build, {
  portableId: 'provider-hub', packageName: 'com.signalboost.providerhub', unsignedAabSha256: 'b'.repeat(64), signedAabPath: 'release/provider-hub-signed.aab', signedAabSha256: 'c'.repeat(64), certificateSha256Fingerprint: Array(32).fill('AB').join(':'), signingKeyReference: 'vault-ref:android/provider-hub/release-v1', signerAttestationReference: 'evidence:provider-hub/signing-attestation-001', signingStartedAt: '2026-07-26T04:10:00.000Z', signingCompletedAt: '2026-07-26T04:11:00.000Z', artifactUploaded: false, playConsolePublished: false, productionExecutionEnabled: false,
})

const readiness = createAndroidPublicationReadiness({
  buildEvidence: build,
  releaseSigningEvidenceRef: 'evidence://provider-hub/release-signing',
  dataSafetyEvidenceRef: 'evidence://provider-hub/data-safety',
  contentRatingEvidenceRef: 'evidence://provider-hub/content-rating',
  privacyPolicyEvidenceRef: 'evidence://provider-hub/privacy-policy',
  supportContactEvidenceRef: 'evidence://provider-hub/support-contact',
  storeListingEvidenceRef: 'evidence://provider-hub/store-listing',
  deviceTestingEvidenceRef: 'evidence://provider-hub/device-testing',
  artifactAccessed: false, signingExecuted: false, storeSubmissionExecuted: false, productionPublished: false, productionExecutionEnabled: false,
})

const input = {
  portableId: 'provider-hub', packageName: 'com.signalboost.providerhub', versionCode: 1, versionName: '1.0.0', releaseTrack: 'internal' as const, signedAabSha256: 'c'.repeat(64), playEditReference: 'evidence:play/edit-001', playReleaseReference: 'evidence:play/release-001', rolloutPercentage: 100, reviewStatus: 'approved' as const, countryCodes: ['US', 'PL', 'BR'], submittedAt: '2026-07-26T05:00:00.000Z', reviewedAt: '2026-07-26T05:30:00.000Z', automaticRolloutEnabled: false as const, artifactUploadedBySignalBoost: false as const, playApiInvoked: false as const, productionPublished: false as const, productionExecutionEnabled: false as const,
}

test('validates deterministic Provider Hub Play publication evidence metadata', () => {
  const report = validateAndroidPublicationEvidence(readiness, signed, input)
  assert.equal(report.state, 'publication_evidence_validated')
  assert.deepEqual(report.blockers, [])
  assert.equal(report.storeMutationPerformed, false)
  assert.equal(report.productionPublished, false)
  assert.ok(Object.isFrozen(report))
  assert.ok(Object.isFrozen(report.blockers))
})

test('fails closed for identity, digest, credential, rollout, and unsafe-state violations', () => {
  const report = validateAndroidPublicationEvidence(readiness, signed, {
    ...input,
    packageName: 'com.signalboost.other',
    signedAabSha256: 'd'.repeat(64),
    playEditReference: 'secret=access_token',
    rolloutPercentage: 10,
    automaticRolloutEnabled: true,
  })
  assert.deepEqual(report.blockers, ['identity', 'digest-linkage', 'console-references', 'rollout', 'unsafe-material', 'unsafe-state'])
})

test('blocks malformed prerequisite and input values without throwing', () => {
  const report = validateAndroidPublicationEvidence(null, null, null)
  assert.equal(report.state, 'blocked')
  assert.deepEqual(report.blockers, ['publication-readiness', 'signed-bundle-evidence', 'identity', 'release-version', 'release-track', 'digest-linkage', 'console-references', 'rollout', 'review-status', 'country-scope', 'timestamps', 'unsafe-state'])
})

test('rejects prerequisite reports with contradictory safety fields', () => {
  const unsafeReadiness = { ...readiness, artifactAccessed: true }
  const unsafeSigned = { ...signed, rawSigningMaterialAccepted: true }
  const report = validateAndroidPublicationEvidence(unsafeReadiness, unsafeSigned, input)
  assert.deepEqual(report.blockers, ['publication-readiness', 'signed-bundle-evidence'])
})

test('rejects coerced release numbers from untyped callers', () => {
  const booleanVersion = validateAndroidPublicationEvidence(readiness, signed, { ...input, versionCode: true })
  assert.ok(booleanVersion.blockers.includes('release-version'))
  assert.equal(booleanVersion.versionCode, 0)

  const stringRollout = validateAndroidPublicationEvidence(readiness, signed, { ...input, rolloutPercentage: '100' })
  assert.ok(stringRollout.blockers.includes('rollout'))
})

test('publication evidence source has no store execution or mutation capability', async () => {
  const source = await readFile(new URL('../portable-mobile/android-publication-evidence.ts', import.meta.url), 'utf8').then(hydrateLocalizedSource)
  for (const forbidden of ["from 'node:child_process'", "from 'node:fs'", 'exec(', 'spawn(', 'fetch(', 'readFile(', 'writeFile(', 'androidpublisher', 'serviceAccountCredentials', 'insertEdit(', 'commitEdit(', 'uploadBundle(']) {
    assert.equal(source.includes(forbidden), false, `publication evidence contract must not contain ${forbidden}`)
  }
})
