import assert from 'node:assert/strict'
import test from 'node:test'

import { createAndroidPublicationDecision } from '../portable-mobile/android-publication-decision.ts'

const digest = 'a'.repeat(64)
const publicationEvidence = Object.freeze({
  schemaVersion: 'signalboost-android-publication-evidence-v1',
  portableId: 'campaign-studio',
  packageName: 'com.signalboost.campaignstudio',
  versionCode: 12,
  versionName: '1.2.0',
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
const releaseEvidence = Object.freeze({
  schemaVersion: 'signalboost-android-play-console-release-evidence-v1',
  portableId: 'campaign-studio',
  packageName: 'com.signalboost.campaignstudio',
  sourceCommitSha: 'b'.repeat(40),
  signedAabSha256: digest,
  state: 'release_evidence_ready',
  blockers: Object.freeze([]),
  evidenceReferences: Object.freeze({ internalTesting: 'evidence://internal' }),
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
const base = {
  publicationEvidence,
  releaseEvidence,
  decision: 'approve' as const,
  decisionReference: 'evidence://publication-decision/12',
  decidedAt: '2026-07-26T07:00:00.000Z',
  artifactAccessed: false as const,
  artifactUploaded: false as const,
  playConsoleApiCalled: false as const,
  releaseCreated: false as const,
  rolloutStarted: false as const,
  productionPublished: false as const,
  productionExecutionEnabled: false as const,
}

test('creates immutable approve and hold publication decisions without executing publication', () => {
  const approved = createAndroidPublicationDecision(base)
  assert.equal(approved.state, 'publication_approved')
  assert.equal(approved.decision, 'approve')
  assert.equal(approved.signedAabSha256, digest)
  assert.deepEqual(approved.blockers, [])
  assert.equal(Object.isFrozen(approved), true)
  assert.equal(Object.isFrozen(approved.blockers), true)
  assert.equal(approved.playConsoleApiCalled, false)
  assert.equal(approved.productionPublished, false)

  const held = createAndroidPublicationDecision({ ...base, decision: 'hold' })
  assert.equal(held.state, 'publication_held')
  assert.equal(held.decision, 'hold')
})

test('fails closed for unsafe prerequisites, mismatches, malformed input, and mutation claims', () => {
  const unsafePublication = { ...publicationEvidence, artifactAccessed: true }
  assert.deepEqual(createAndroidPublicationDecision({ ...base, publicationEvidence: unsafePublication }).blockers, ['publication-evidence'])

  const unsafeRelease = { ...releaseEvidence, rolloutStarted: true }
  assert.deepEqual(createAndroidPublicationDecision({ ...base, releaseEvidence: unsafeRelease }).blockers, ['release-evidence'])

  const mismatch = { ...releaseEvidence, packageName: 'com.signalboost.other' }
  assert.ok(createAndroidPublicationDecision({ ...base, releaseEvidence: mismatch }).blockers.includes('identity'))

  const malformed = createAndroidPublicationDecision({ ...base, decisionReference: 'evidence://../secret', decidedAt: 'bad-date' })
  assert.ok(malformed.blockers.includes('decision-reference'))
  assert.ok(malformed.blockers.includes('decision-timestamp'))

  const unsafe = createAndroidPublicationDecision({ ...base, playConsoleApiCalled: true })
  assert.ok(unsafe.blockers.includes('unsafe-state'))
  assert.equal(unsafe.state, 'blocked')
  assert.equal(unsafe.decision, 'blocked')
})
