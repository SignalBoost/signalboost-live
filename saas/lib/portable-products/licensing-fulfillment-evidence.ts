// saas/lib/portable-products/licensing-fulfillment-evidence.ts
import { portableProductRegistry } from './product-registry.ts'

export const portableLicensingFulfillmentEvidenceSchemaVersion = 'portable-licensing-fulfillment-evidence.v1' as const

export type PortableCommercialEvidenceStatus = 'absent' | 'documented' | 'verified'

export interface PortableCommercialEvidenceInput {
  readonly status: PortableCommercialEvidenceStatus
  readonly references: readonly string[]
}

export interface PortableLicensingFulfillmentEvidenceInput {
  readonly productId: string
  readonly licensing: PortableCommercialEvidenceInput
  readonly fulfillment: PortableCommercialEvidenceInput
  readonly checkoutEnabled: boolean
  readonly billingMutationEnabled: boolean
  readonly entitlementMutationEnabled: boolean
  readonly fulfillmentMutationEnabled: boolean
}

export interface PortableLicensingFulfillmentEvidence extends PortableLicensingFulfillmentEvidenceInput {
  readonly schemaVersion: typeof portableLicensingFulfillmentEvidenceSchemaVersion
  readonly licensingReady: boolean
  readonly fulfillmentReady: boolean
  readonly complete: boolean
  readonly blockers: readonly string[]
}

const validStatuses = new Set<PortableCommercialEvidenceStatus>(['absent', 'documented', 'verified'])

function normalizedReferences(values: readonly string[]): readonly string[] {
  return Object.freeze(values.map(value => value.trim()).filter(value => value.length > 0))
}

function evidenceBlockers(prefix: 'licensing' | 'fulfillment', evidence: PortableCommercialEvidenceInput): readonly string[] {
  if (!validStatuses.has(evidence.status)) return Object.freeze([`invalid-${prefix}-status`])
  if (evidence.status === 'absent') return Object.freeze([`missing-${prefix}-evidence`])
  if (evidence.references.length === 0) return Object.freeze([`missing-${prefix}-references`])
  return Object.freeze([])
}

export function createPortableLicensingFulfillmentEvidence(
  input: PortableLicensingFulfillmentEvidenceInput,
): PortableLicensingFulfillmentEvidence {
  const productId = input.productId.trim()
  const registered = portableProductRegistry.some(item => item.manifest.productId === productId)
  const licensing = Object.freeze({ ...input.licensing, references: normalizedReferences(input.licensing.references) })
  const fulfillment = Object.freeze({ ...input.fulfillment, references: normalizedReferences(input.fulfillment.references) })
  const licensingBlockers = evidenceBlockers('licensing', licensing)
  const fulfillmentBlockers = evidenceBlockers('fulfillment', fulfillment)
  const mutationBlockers = [
    ...(input.checkoutEnabled ? ['checkout-enabled'] : []),
    ...(input.billingMutationEnabled ? ['billing-mutation-enabled'] : []),
    ...(input.entitlementMutationEnabled ? ['entitlement-mutation-enabled'] : []),
    ...(input.fulfillmentMutationEnabled ? ['fulfillment-mutation-enabled'] : []),
  ]
  const blockers = [
    ...(!registered ? ['unknown-product-id'] : []),
    ...licensingBlockers,
    ...fulfillmentBlockers,
    ...mutationBlockers,
  ]
  return Object.freeze({
    schemaVersion: portableLicensingFulfillmentEvidenceSchemaVersion,
    productId,
    licensing,
    fulfillment,
    checkoutEnabled: false,
    billingMutationEnabled: false,
    entitlementMutationEnabled: false,
    fulfillmentMutationEnabled: false,
    licensingReady: licensingBlockers.length === 0,
    fulfillmentReady: fulfillmentBlockers.length === 0,
    complete: blockers.length === 0,
    blockers: Object.freeze(blockers),
  })
}
