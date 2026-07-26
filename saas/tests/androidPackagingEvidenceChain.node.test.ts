import assert from 'node:assert/strict'
import test from 'node:test'

import { validateAndroidPackagingEvidenceChain } from '../portable-mobile/android-packaging-evidence-chain.ts'

const portableId = 'provider-hub'
const packageName = 'com.signalboost.providerhub'
const sourceCommitSha = 'a'.repeat(40)
const unsignedAabSha256 = 'b'.repeat(64)
const signedAabSha256 = 'c'.repeat(64)

const safe = {
  readiness: { schemaVersion: 'signalboost-android-publication-readiness-v1', state: 'publication_ready', blockers: [], portableId, packageName, readOnly: true, artifactAccessed: false, productionExecutionEnabled: false },
  buildEvidence: { schemaVersion: 'signalboost-android-build-evidence-v1', state: 'build_evidence_validated', blockers: [], portableId, packageName, sourceCommitSha, unsignedAabSha256, readOnly: true, artifactAccessed: false, productionExecutionEnabled: false },
  signedBundleEvidence: { schemaVersion: 'signalboost-android-signed-bundle-evidence-v1', state: 'signed_bundle_evidence_validated', blockers: [], portableId, packageName, sourceCommitSha, unsignedAabSha256, signedAabSha256, readOnly: true, artifactAccessed: false, productionExecutionEnabled: false },
  releaseEvidence: { schemaVersion: 'signalboost-android-play-console-release-evidence-v1', state: 'release_evidence_ready', blockers: [], rolloutEligible: true, portableId, packageName, sourceCommitSha, signedAabSha256, readOnly: true, artifactAccessed: false, artifactUploaded: false, playConsoleApiCalled: false, releaseCreated: false, rolloutStarted: false, productionExecutionEnabled: false },
  publicationEvidence: { schemaVersion: 'signalboost-android-publication-evidence-v1', state: 'publication_evidence_validated', blockers: [], portableId, packageName, versionCode: 1, versionName: '1.0.0', releaseTrack: 'production', signedAabSha256, readOnly: true, artifactAccessed: false, playApiInvoked: false, storeMutationPerformed: false, productionPublished: false, productionExecutionEnabled: false },
  productionPublicationEvidence: { schemaVersion: 'signalboost-android-production-publication-evidence-v1', state: 'production_publication_evidence_validated', blockers: [], portableId, packageName, versionCode: 1, versionName: '1.0.0', signedAabSha256, readOnly: true, artifactAccessed: false, playApiInvoked: false, storeMutationPerformed: false, publishedBySignalBoost: false, productionExecutionEnabled: false },
} as const

test('validates deterministic immutable Provider Hub packaging evidence chain', () => {
  const first = validateAndroidPackagingEvidenceChain(safe)
  const second = validateAndroidPackagingEvidenceChain(safe)
  assert.deepEqual(first, second)
  assert.equal(first.state, 'packaging_evidence_chain_validated')
  assert.deepEqual(first.blockers, [])
  assert.deepEqual(first.phases, ['readiness', 'build-evidence', 'signed-bundle-evidence', 'release-evidence', 'publication-evidence', 'production-publication-evidence'])
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.blockers))
  assert.ok(Object.isFrozen(first.phases))
})

test('fails closed for missing phases and exact-false safety state', () => {
  const malformed = validateAndroidPackagingEvidenceChain(null)
  assert.equal(malformed.state, 'blocked')
  assert.deepEqual(malformed.blockers, ['readiness', 'build-evidence', 'signed-bundle-evidence', 'release-evidence', 'publication-evidence', 'production-publication-evidence', 'identity', 'source-commit', 'digest-linkage', 'release-version', 'unsafe-state'])

  const unsafe = validateAndroidPackagingEvidenceChain({
    ...safe,
    productionPublicationEvidence: { ...safe.productionPublicationEvidence, publishedBySignalBoost: true },
  })
  assert.deepEqual(unsafe.blockers, ['unsafe-state'])
})

test('reports deterministic identity, digest, and version linkage blockers', () => {
  const result = validateAndroidPackagingEvidenceChain({
    ...safe,
    signedBundleEvidence: { ...safe.signedBundleEvidence, packageName: 'com.signalboost.other', signedAabSha256: 'd'.repeat(64) },
    productionPublicationEvidence: { ...safe.productionPublicationEvidence, versionCode: 2 },
  })
  assert.deepEqual(result.blockers, ['identity', 'digest-linkage', 'release-version'])
})
