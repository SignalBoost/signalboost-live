import {
  PORTABLE_BROWSER_DEPLOYMENT_BUNDLE_VERIFICATION_SCHEMA_VERSION,
  type PortableBrowserDeploymentBundleVerification,
} from './browser-deployment-bundle-verifier.ts'

export const PORTABLE_BROWSER_BUYER_HANDOFF_RECEIPT_SCHEMA_VERSION = '1.0.0' as const

export interface PortableBrowserBuyerHandoffReceiptInput {
  readonly receiptId: string
  readonly senderId: string
  readonly recipientId: string
  readonly transferredAt: number
  readonly receivedAt: number
  readonly verification: PortableBrowserDeploymentBundleVerification
}

export interface PortableBrowserBuyerHandoffReceipt {
  readonly schemaVersion: typeof PORTABLE_BROWSER_BUYER_HANDOFF_RECEIPT_SCHEMA_VERSION
  readonly receiptId: string
  readonly senderId: string
  readonly recipientId: string
  readonly transferredAt: number
  readonly receivedAt: number
  readonly purpose: 'buyer_handoff_receipt'
  readonly bundleId: string
  readonly productId: string
  readonly productVersion: string
  readonly installationId: string
  readonly providerId: string
  readonly bundleVerified: true
  readonly acknowledgement: 'received_and_verified'
  readonly canonicalReceiptPayload: string
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return value
}

function requireIdentifier(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) throw new Error(code)
  return value
}

function requireTimestamp(value: unknown, code: string): number {
  if (!Number.isFinite(value) || (value as number) < 0) throw new Error(code)
  return value as number
}

export function buildPortableBrowserBuyerHandoffReceipt(
  input: PortableBrowserBuyerHandoffReceiptInput,
): PortableBrowserBuyerHandoffReceipt {
  const verification = input?.verification
  if (!verification || verification.schemaVersion !== PORTABLE_BROWSER_DEPLOYMENT_BUNDLE_VERIFICATION_SCHEMA_VERSION) {
    throw new Error('portable_browser_buyer_handoff_receipt_verification_invalid')
  }
  if (!verification.verified || verification.failureCodes.length > 0) {
    throw new Error('portable_browser_buyer_handoff_receipt_verified_bundle_required')
  }

  const receiptId = requireIdentifier(input.receiptId, 'portable_browser_buyer_handoff_receipt_id_invalid')
  const senderId = requireIdentifier(input.senderId, 'portable_browser_buyer_handoff_receipt_sender_id_invalid')
  const recipientId = requireIdentifier(input.recipientId, 'portable_browser_buyer_handoff_receipt_recipient_id_invalid')
  if (senderId === recipientId) throw new Error('portable_browser_buyer_handoff_receipt_parties_must_differ')

  const transferredAt = requireTimestamp(input.transferredAt, 'portable_browser_buyer_handoff_receipt_transferred_at_invalid')
  const receivedAt = requireTimestamp(input.receivedAt, 'portable_browser_buyer_handoff_receipt_received_at_invalid')
  if (receivedAt < transferredAt) throw new Error('portable_browser_buyer_handoff_receipt_received_before_transfer')

  const identity = {
    bundleId: verification.bundleId,
    productId: verification.productId,
    productVersion: verification.productVersion,
    installationId: verification.installationId,
    providerId: verification.providerId,
  }
  const canonicalReceiptPayload = JSON.stringify({
    schemaVersion: PORTABLE_BROWSER_BUYER_HANDOFF_RECEIPT_SCHEMA_VERSION,
    receiptId,
    senderId,
    recipientId,
    transferredAt,
    receivedAt,
    purpose: 'buyer_handoff_receipt',
    ...identity,
    bundleVerified: true,
    acknowledgement: 'received_and_verified',
  })

  return deepFreeze({
    schemaVersion: PORTABLE_BROWSER_BUYER_HANDOFF_RECEIPT_SCHEMA_VERSION,
    receiptId,
    senderId,
    recipientId,
    transferredAt,
    receivedAt,
    purpose: 'buyer_handoff_receipt' as const,
    ...identity,
    bundleVerified: true as const,
    acknowledgement: 'received_and_verified' as const,
    canonicalReceiptPayload,
  })
}
