// saas/lib/portable-products/support-boundary-evidence.ts
import { portableProductRegistry } from './product-registry.ts'

export const portableSupportBoundaryEvidenceSchemaVersion = 'portable-support-boundary-evidence.v1' as const

export type PortableSupportBoundaryEvidenceBlocker =
  | 'identity'
  | 'scope'
  | 'coverage'
  | 'references'
  | 'timestamps'
  | 'acknowledgment'
  | 'unsafe-state'

export interface PortableSupportBoundaryEvidenceInput {
  readonly productId: string
  readonly tenantId: string
  readonly environmentId: string
  readonly supportOwner: string
  readonly serviceWindow: string
  readonly responseTargets: readonly string[]
  readonly escalationPathReference: string
  readonly maintenancePolicyReference: string
  readonly exclusions: readonly string[]
  readonly evaluatedAt: string
  readonly acknowledgedAt: string
  readonly buyerAcknowledged: boolean
  readonly ticketOpened: boolean
  readonly providerContacted: boolean
  readonly configurationMutated: boolean
  readonly deploymentPerformed: boolean
  readonly productionExecutionEnabled: boolean
}

export interface PortableSupportBoundaryEvidence extends PortableSupportBoundaryEvidenceInput {
  readonly schemaVersion: typeof portableSupportBoundaryEvidenceSchemaVersion
  readonly state: 'support_boundary_validated' | 'blocked'
  readonly blockers: readonly PortableSupportBoundaryEvidenceBlocker[]
}

const safeId = /^[a-z0-9][a-z0-9._-]*$/
const safeReference = /^(?:urn:[a-z0-9][a-z0-9:._/-]*|https:\/\/[^?\s#]+)$/i

function validTimestamp(value: string): boolean {
  return value.length > 0 && Number.isFinite(Date.parse(value))
}

function uniqueNonEmpty(values: readonly string[]): boolean {
  const normalized = values.map(value => value.trim()).filter(Boolean)
  return normalized.length === values.length && new Set(normalized).size === normalized.length
}

export function validatePortableSupportBoundaryEvidence(input: PortableSupportBoundaryEvidenceInput): PortableSupportBoundaryEvidence {
  const blockers = new Set<PortableSupportBoundaryEvidenceBlocker>()

  const registered = portableProductRegistry.some(entry => entry.manifest.productId === input.productId)
  if (!registered) blockers.add('identity')
  if (!safeId.test(input.tenantId) || !safeId.test(input.environmentId)) blockers.add('scope')
  if (!input.supportOwner.trim() || !input.serviceWindow.trim() || !uniqueNonEmpty(input.responseTargets) || !uniqueNonEmpty(input.exclusions)) blockers.add('coverage')
  if (!safeReference.test(input.escalationPathReference) || !safeReference.test(input.maintenancePolicyReference)) blockers.add('references')
  if (!validTimestamp(input.evaluatedAt) || !validTimestamp(input.acknowledgedAt) || Date.parse(input.acknowledgedAt) < Date.parse(input.evaluatedAt)) blockers.add('timestamps')
  if (!input.buyerAcknowledged) blockers.add('acknowledgment')
  if (input.ticketOpened || input.providerContacted || input.configurationMutated || input.deploymentPerformed || input.productionExecutionEnabled) blockers.add('unsafe-state')

  const result = {
    ...input,
    schemaVersion: portableSupportBoundaryEvidenceSchemaVersion,
    state: blockers.size === 0 ? 'support_boundary_validated' : 'blocked',
    responseTargets: Object.freeze([...input.responseTargets]),
    exclusions: Object.freeze([...input.exclusions]),
    blockers: Object.freeze([...blockers]),
  } as const

  return Object.freeze(result)
}
