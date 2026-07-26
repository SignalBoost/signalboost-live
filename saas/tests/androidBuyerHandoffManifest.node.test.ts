import assert from 'node:assert/strict'
import test from 'node:test'

import { validateAndroidBuyerHandoffManifest } from '../portable-mobile/android-buyer-handoff-manifest.ts'

const phases = ['readiness', 'build-evidence', 'signed-bundle-evidence', 'release-evidence', 'publication-evidence', 'production-publication-evidence'] as const
const chain = Object.freeze({
  schemaVersion: 'signalboost-android-packaging-evidence-chain-v1', portableId: 'provider-hub', packageName: 'com.signalboost.providerhub',
  sourceCommitSha: 'a'.repeat(40), unsignedAabSha256: 'b'.repeat(64), signedAabSha256: 'c'.repeat(64),
  versionCode: 1, versionName: '1.0.0', state: 'packaging_evidence_chain_validated', blockers: Object.freeze([]), phases: Object.freeze(phases),
  readOnly: true, artifactAccessed: false, playApiInvoked: false, storeMutationPerformed: false, productionExecutionEnabled: false,
})
const safe = {
  evidenceChain: chain, portableId: 'provider-hub', packageName: 'com.signalboost.providerhub',
  buyerReference: 'evidence://buyer/provider-hub-owner', transferReference: 'evidence://handoff/provider-hub-v1', supportReference: 'evidence://support/provider-hub',
  preparedAt: '2026-07-26T10:00:00.000Z', acknowledgedAt: '2026-07-26T10:30:00.000Z',
  buyerControlsSigningKeys: true, buyerControlsPlayConsole: true, buyerAcceptsExternalPublicationResponsibility: true,
  credentialsTransferred: false, artifactAccessed: false, playApiInvoked: false, storeMutationPerformed: false, productionExecutionEnabled: false,
} as const

test('validates deterministic immutable Provider Hub buyer handoff manifest', () => {
  const first = validateAndroidBuyerHandoffManifest(safe)
  assert.deepEqual(first, validateAndroidBuyerHandoffManifest(safe))
  assert.equal(first.state, 'buyer_handoff_manifest_validated')
  assert.deepEqual(first.blockers, [])
  assert.deepEqual(first.externalResponsibilities, ['signing-key-custody', 'play-console-access', 'aab-upload', 'review-response', 'rollout-control', 'store-publication', 'live-store-verification'])
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.blockers) && Object.isFrozen(first.externalResponsibilities) && Object.isFrozen(first.references))
})

test('rejects forged packaging evidence chain metadata', () => {
  for (const evidenceChain of [
    { ...chain, sourceCommitSha: 'not-a-sha' },
    { ...chain, unsignedAabSha256: 'bad' },
    { ...chain, versionCode: -7 },
    { ...chain, phases: [] },
  ]) {
    const result = validateAndroidBuyerHandoffManifest({ ...safe, evidenceChain })
    assert.equal(result.state, 'blocked')
    assert.ok(result.blockers.includes('evidence-chain'))
  }
})

test('rejects credential-bearing and encoded handoff references', () => {
  for (const buyerReference of [
    'https://example.com/buyer?api_key=plaintext',
    'https://example.com/buyer?apikey=plaintext',
    'https://example.com/buyer?access_token=plaintext',
    'https://example.com/buyer?%61%70%69%5f%6b%65%79=plaintext',
  ]) {
    const result = validateAndroidBuyerHandoffManifest({ ...safe, buyerReference })
    assert.equal(result.state, 'blocked')
    assert.ok(result.blockers.includes('references'))
    assert.equal(result.references.buyer, '')
  }
})

test('fails closed for missing acknowledgments and unsafe state', () => {
  const malformed = validateAndroidBuyerHandoffManifest(null)
  assert.deepEqual(malformed.blockers, ['evidence-chain', 'identity', 'references', 'timestamps', 'acknowledgments', 'unsafe-state'])
  assert.deepEqual(validateAndroidBuyerHandoffManifest({ ...safe, buyerControlsPlayConsole: false }).blockers, ['acknowledgments'])
  assert.deepEqual(validateAndroidBuyerHandoffManifest({ ...safe, credentialsTransferred: true }).blockers, ['unsafe-state'])
})
