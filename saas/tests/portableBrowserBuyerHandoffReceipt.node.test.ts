import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPortableBrowserBuyerHandoffReceipt } from '../lib/portable-browser/browser-buyer-handoff-receipt.ts'
import type { PortableBrowserDeploymentBundleVerification } from '../lib/portable-browser/browser-deployment-bundle-verifier.ts'

const verification: PortableBrowserDeploymentBundleVerification = {
  schemaVersion: '1.0.0',
  bundleId: 'bundle-001',
  productId: 'portable-browser',
  productVersion: '1.0.0',
  installationId: 'buyer-installation-001',
  providerId: 'playwright-local',
  verified: true,
  missingRequiredPaths: [],
  hashMismatchPaths: [],
  sizeMismatchPaths: [],
  unexpectedPaths: [],
  failureCodes: [],
}

test('builds a deterministic immutable buyer handoff receipt', () => {
  const input = {
    receiptId: 'receipt-001',
    senderId: 'seller-operations',
    recipientId: 'buyer-security',
    transferredAt: 400,
    receivedAt: 401,
    verification,
  }
  const first = buildPortableBrowserBuyerHandoffReceipt(input)
  const second = buildPortableBrowserBuyerHandoffReceipt(input)

  assert.deepEqual(first, second)
  assert.equal(first.bundleVerified, true)
  assert.equal(first.acknowledgement, 'received_and_verified')
  assert.equal(first.bundleId, 'bundle-001')
  assert.equal(first.productId, 'portable-browser')
  assert.equal(first.providerId, 'playwright-local')
  assert.equal(first.canonicalReceiptPayload, second.canonicalReceiptPayload)
  assert.ok(Object.isFrozen(first))
})

test('rejects unverified bundles and incompatible verification schemas', () => {
  assert.throws(() => buildPortableBrowserBuyerHandoffReceipt({
    receiptId: 'receipt-002',
    senderId: 'seller-operations',
    recipientId: 'buyer-security',
    transferredAt: 400,
    receivedAt: 401,
    verification: { ...verification, verified: false, failureCodes: ['bundle_missing_required:manifest.json'] },
  }), /verified_bundle_required/)

  assert.throws(() => buildPortableBrowserBuyerHandoffReceipt({
    receiptId: 'receipt-003',
    senderId: 'seller-operations',
    recipientId: 'buyer-security',
    transferredAt: 400,
    receivedAt: 401,
    verification: { ...verification, schemaVersion: '2.0.0' as never },
  }), /verification_invalid/)
})

test('rejects malformed identities, identical parties, and invalid chronology', () => {
  assert.throws(() => buildPortableBrowserBuyerHandoffReceipt({
    receiptId: '../unsafe',
    senderId: 'seller-operations',
    recipientId: 'buyer-security',
    transferredAt: 400,
    receivedAt: 401,
    verification,
  }), /receipt_id_invalid/)

  assert.throws(() => buildPortableBrowserBuyerHandoffReceipt({
    receiptId: 'receipt-004',
    senderId: 'same-party',
    recipientId: 'same-party',
    transferredAt: 400,
    receivedAt: 401,
    verification,
  }), /parties_must_differ/)

  assert.throws(() => buildPortableBrowserBuyerHandoffReceipt({
    receiptId: 'receipt-005',
    senderId: 'seller-operations',
    recipientId: 'buyer-security',
    transferredAt: 402,
    receivedAt: 401,
    verification,
  }), /received_before_transfer/)
})
