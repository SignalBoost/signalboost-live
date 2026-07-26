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

function normalizedReferences(values: readonly string[]): readonly string[] {
  return Object.freeze(values.map(value => value.trim()).filter(value => value.length > 0))
}

function evidenceBlockers(prefix: 'licensing' | 'fulfillment', evidence: PortableCommercialEvidenceInput): readonly string[] {
  if (evidence.status === 'absent') return Object.freeze([`missing-${prefix}-evidence`])
  if (evidence.references.length === 0) return Object.freeze([`missing-${prefix}-references`])
  return Object.freeze([])
}

export function createPortableLicensingFulfillmentEvidence(
  input: PortableLicensingFulfillmentEvidenceInput,
): PortableLicensingFulfillmentEvidence {
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
    ...(!input.productId.trim() ? ['missing-product-id'] : []),
    ...licensingBlockers,
    ...fulfillmentBlockers,
    ...mutationBlockers,
  ]
  return Object.freeze({
    schemaVersion: portableLicensingFulfillmentEvidenceSchemaVersion,
    productId: input.productId,
    licensing,
    fulfillment,
    checkoutEnabled: input.checkoutEnabled,
    billingMutationEnabled: input.billingMutationEnabled,
    entitlementMutationEnabled: input.entitlementMutationEnabled,
    fulfillmentMutationEnabled: input.fulfillmentMutationEnabled,
    licensingReady: licensingBlockers.length === 0,
    fulfillmentReady: fulfillmentBlockers.length === 0,
    complete: blockers.length === 0,
    blockers: Object.freeze(blockers),
  })
}
