import assert from 'node:assert/strict'
import test from 'node:test'

import { validateAndroidBuyerHandoffManifest } from '../portable-mobile/android-buyer-handoff-manifest.ts'

const chain = Object.freeze({
  schemaVersion: 'signalboost-android-packaging-evidence-chain-v1',
  portableId: 'provider-hub',
  packageName: 'com.signalboost.providerhub',
  sourceCommitSha: 'a'.repeat(40),
  unsignedAabSha256: 'b'.repeat(64),
  signedAabSha256: 'c'.repeat(64),
  versionCode: 1,
  versionName: '1.0.0',
  state: 'packaging_evidence_chain_validated',
  blockers: Object.freeze([]),
  phases: Object.freeze([]),
  readOnly: true,
  artifactAccessed: false,
  playApiInvoked: false,
  storeMutationPerformed: false,
  productionExecutionEnabled: false,
})

const safe = {
  evidenceChain: chain,
  portableId: 'provider-hub',
  packageName: 'com.signalboost.providerhub',
  buyerReference: 'evidence://buyer/provider-hub-owner',
  transferReference: 'evidence://handoff/provider-hub-v1',
  supportReference: 'evidence://support/provider-hub',
  preparedAt: '2026-07-26T10:00:00.000Z',
  acknowledgedAt: '2026-07-26T10:30:00.000Z',
  buyerControlsSigningKeys: true,
  buyerControlsPlayConsole: true,
  buyerAcceptsExternalPublicationResponsibility: true,
  credentialsTransferred: false,
  artifactAccessed: false,
  playApiInvoked: false,
  storeMutationPerformed: false,
  productionExecutionEnabled: false,
} as const

test('validates deterministic immutable Provider Hub buyer handoff manifest', () => {
  const first = validateAndroidBuyerHandoffManifest(safe)
  const second = validateAndroidBuyerHandoffManifest(safe)
  assert.deepEqual(first, second)
  assert.equal(first.state, 'buyer_handoff_manifest_validated')
  assert.deepEqual(first.blockers, [])
  assert.deepEqual(first.externalResponsibilities, ['signing-key-custody', 'play-console-access', 'aab-upload', 'review-response', 'rollout-control', 'store-publication', 'live-store-verification'])
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.blockers))
  assert.ok(Object.isFrozen(first.externalResponsibilities))
  assert.ok(Object.isFrozen(first.references))
})

test('fails closed for malformed input and missing acknowledgments', () => {
  const malformed = validateAndroidBuyerHandoffManifest(null)
  assert.equal(malformed.state, 'blocked')
  assert.deepEqual(malformed.blockers, ['evidence-chain', 'identity', 'references', 'timestamps', 'acknowledgments', 'unsafe-state'])

  const missing = validateAndroidBuyerHandoffManifest({ ...safe, buyerControlsPlayConsole: false })
  assert.deepEqual(missing.blockers, ['acknowledgments'])
})

test('blocks unsafe references and execution claims deterministically', () => {
  const result = validateAndroidBuyerHandoffManifest({
    ...safe,
    buyerReference: 'https://user:secret@example.com/buyer',
    credentialsTransferred: true,
  })
  assert.deepEqual(result.blockers, ['references', 'unsafe-state'])
})
