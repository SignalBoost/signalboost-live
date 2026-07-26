import assert from 'node:assert/strict'
import test from 'node:test'

import { validateAndroidProductionPublicationEvidence } from '../portable-mobile/android-production-publication-evidence.ts'

const releaseEvidence = Object.freeze({
  schemaVersion: 'signalboost-android-play-console-release-evidence-v1',
  portableId: 'provider-hub',
  packageName: 'com.signalboost.providerhub',
  sourceCommitSha: 'a'.repeat(40),
  signedAabSha256: 'c'.repeat(64),
  state: 'release_evidence_ready',
  blockers: Object.freeze([]),
  evidenceReferences: Object.freeze({}),
  rolloutEligible: true,
  readOnly: true,
  artifactAccessed: false,
  artifactUploaded: false,
  playConsoleApiCalled: false,
  releaseCreated: false,
  rolloutStarted: false,
  productionPublished: false,
  productionExecutionEnabled: false,
})

const publicationEvidence = Object.freeze({
  schemaVersion: 'signalboost-android-publication-evidence-v1',
  portableId: 'provider-hub',
  packageName: 'com.signalboost.providerhub',
  versionCode: 1,
  versionName: '1.0.0',
  releaseTrack: 'production',
  state: 'publication_evidence_validated',
  blockers: Object.freeze([]),
  readOnly: true,
  artifactAccessed: false,
  playApiInvoked: false,
  storeMutationPerformed: false,
  productionPublished: false,
  productionExecutionEnabled: false,
})

const safeInput = {
  releaseEvidence,
  publicationEvidence,
  portableId: 'provider-hub',
  packageName: 'com.signalboost.providerhub',
  versionCode: 1,
  versionName: '1.0.0',
  signedAabSha256: 'c'.repeat(64),
  releaseTrack: 'production',
  reviewStatus: 'approved',
  rolloutPercentage: 100,
  countryCodes: ['US', 'PL', 'BR'],
  publicListingReference: 'evidence://play/public-listing/provider-hub',
  publicationOutcomeReference: 'evidence://play/publication-outcome/provider-hub-v1',
  publishedAt: '2026-07-26T08:00:00.000Z',
  verifiedAt: '2026-07-26T08:30:00.000Z',
  artifactAccessed: false,
  artifactUploadedBySignalBoost: false,
  playApiInvokedBySignalBoost: false,
  rolloutMutatedBySignalBoost: false,
  publishedBySignalBoost: false,
  deploymentPerformedBySignalBoost: false,
  productionExecutionEnabled: false,
} as const

test('validates deterministic immutable Provider Hub production publication evidence', () => {
  const first = validateAndroidProductionPublicationEvidence(safeInput)
  const second = validateAndroidProductionPublicationEvidence(safeInput)
  assert.deepEqual(first, second)
  assert.equal(first.state, 'production_publication_evidence_validated')
  assert.deepEqual(first.blockers, [])
  assert.deepEqual(first.countryCodes, ['BR', 'PL', 'US'])
  assert.equal(first.liveStoreNetworkVerified, false)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.blockers))
  assert.ok(Object.isFrozen(first.countryCodes))
  assert.ok(Object.isFrozen(first.evidenceReferences))
})

test('fails closed for malformed input and unsafe state claims', () => {
  assert.doesNotThrow(() => validateAndroidProductionPublicationEvidence(null))
  const malformed = validateAndroidProductionPublicationEvidence(null)
  assert.equal(malformed.state, 'blocked')
  assert.ok(malformed.blockers.includes('release-evidence'))
  assert.ok(malformed.blockers.includes('publication-evidence'))
  assert.ok(malformed.blockers.includes('unsafe-state'))

  const unsafe = validateAndroidProductionPublicationEvidence({ ...safeInput, publishedBySignalBoost: true })
  assert.deepEqual(unsafe.blockers, ['unsafe-state'])
})

test('reports deterministic linkage and publication blockers', () => {
  const result = validateAndroidProductionPublicationEvidence({
    ...safeInput,
    packageName: 'com.signalboost.other',
    versionCode: 2,
    releaseTrack: 'open',
    signedAabSha256: 'd'.repeat(64),
    reviewStatus: 'in_review',
    rolloutPercentage: 50,
    countryCodes: ['US', 'US'],
    verifiedAt: '2026-07-26T07:00:00.000Z',
  })
  assert.deepEqual(result.blockers, [
    'identity',
    'release-version',
    'release-track',
    'digest-linkage',
    'review-status',
    'rollout',
    'country-scope',
    'timestamps',
  ])
})

test('rejects credential-shaped and embedded-identity references', () => {
  const result = validateAndroidProductionPublicationEvidence({
    ...safeInput,
    publicListingReference: 'https://user:password@example.com/store/provider-hub',
    publicationOutcomeReference: 'evidence://play/outcome?access_token=secret',
  })
  assert.deepEqual(result.blockers, ['publication-references', 'unsafe-material'])
})
