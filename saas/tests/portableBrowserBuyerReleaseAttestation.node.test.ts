import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPortableBrowserBuyerReleaseAttestation } from '../lib/portable-browser/browser-buyer-release-attestation.ts'
import type { PortableBrowserInstallationAcceptanceReport } from '../lib/portable-browser/browser-installation-acceptance.ts'

function acceptance(accepted = true): PortableBrowserInstallationAcceptanceReport {
  return {
    schemaVersion: '1.0.0',
    installationId: 'buyer-installation-001',
    evaluatedAt: 200,
    productId: 'portable-browser',
    productVersion: '1.0.0',
    providerId: 'playwright-local',
    accepted,
    checks: [
      { id: 'package_integrity', passed: accepted, required: true },
      { id: 'startup_preflight', passed: accepted, required: true },
    ],
    failureCodes: accepted ? [] : ['preflight:approval_required'],
  }
}

test('builds a deterministic immutable signing-ready buyer release attestation', () => {
  const input = {
    attestationId: 'release-001',
    issuerId: 'buyer-security-office',
    issuedAt: 250,
    acceptance: acceptance(),
  }
  const first = buildPortableBrowserBuyerReleaseAttestation(input)
  const second = buildPortableBrowserBuyerReleaseAttestation(input)

  assert.deepEqual(first, second)
  assert.equal(first.releaseApproved, true)
  assert.equal(first.signatureRequired, true)
  assert.equal(first.subject.productId, 'portable-browser')
  assert.deepEqual(first.acceptanceChecks, ['package_integrity', 'startup_preflight'])
  assert.equal(first.signingPayload, JSON.stringify({
    schemaVersion: '1.0.0',
    attestationId: 'release-001',
    issuerId: 'buyer-security-office',
    issuedAt: 250,
    purpose: 'buyer_release_attestation',
    subject: {
      productId: 'portable-browser',
      productVersion: '1.0.0',
      installationId: 'buyer-installation-001',
      providerId: 'playwright-local',
    },
    acceptanceEvaluatedAt: 200,
    acceptanceChecks: ['package_integrity', 'startup_preflight'],
    releaseApproved: true,
  }))
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.subject))
  assert.ok(Object.isFrozen(first.acceptanceChecks))
})

test('fails closed when installation acceptance was rejected', () => {
  assert.throws(() => buildPortableBrowserBuyerReleaseAttestation({
    attestationId: 'release-002',
    issuerId: 'buyer-security-office',
    issuedAt: 250,
    acceptance: acceptance(false),
  }), /acceptance_required/)
})

test('rejects malformed identifiers and release timestamps before acceptance', () => {
  assert.throws(() => buildPortableBrowserBuyerReleaseAttestation({
    attestationId: '../unsafe',
    issuerId: 'buyer-security-office',
    issuedAt: 250,
    acceptance: acceptance(),
  }), /attestation_id_invalid/)

  assert.throws(() => buildPortableBrowserBuyerReleaseAttestation({
    attestationId: 'release-003',
    issuerId: 'Buyer Security Office',
    issuedAt: 250,
    acceptance: acceptance(),
  }), /issuer_id_invalid/)

  assert.throws(() => buildPortableBrowserBuyerReleaseAttestation({
    attestationId: 'release-004',
    issuerId: 'buyer-security-office',
    issuedAt: 199,
    acceptance: acceptance(),
  }), /issued_before_acceptance/)
})

test('rejects missing or incompatible acceptance reports', () => {
  assert.throws(() => buildPortableBrowserBuyerReleaseAttestation({
    attestationId: 'release-005',
    issuerId: 'buyer-security-office',
    issuedAt: 250,
    acceptance: null as never,
  }), /acceptance_invalid/)

  assert.throws(() => buildPortableBrowserBuyerReleaseAttestation({
    attestationId: 'release-006',
    issuerId: 'buyer-security-office',
    issuedAt: 250,
    acceptance: { ...acceptance(), schemaVersion: '2.0.0' } as never,
  }), /acceptance_invalid/)
})
