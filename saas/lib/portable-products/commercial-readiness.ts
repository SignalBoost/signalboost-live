import { portableArchitectureClosureReport } from './architecture-closure.ts'
import { portableProductRegistry } from './product-registry.ts'

export const portableCommercialReadinessSchemaVersion = 'portable-commercial-readiness.v1' as const

export const commercialReadinessDimensions = Object.freeze([
  'architecture',
  'distribution-package',
  'integrity-manifest',
  'buyer-installation',
  'licensing-enforcement',
  'fulfillment-handoff',
  'operations-recovery',
  'buyer-configuration',
  'deployment-acceptance',
  'support-boundary',
] as const)

export type PortableCommercialReadinessDimension = typeof commercialReadinessDimensions[number]
export type PortableCommercialReadinessStatus = 'ready' | 'blocked'

export interface PortableCommercialReadinessCheck {
  readonly dimension: PortableCommercialReadinessDimension
  readonly status: PortableCommercialReadinessStatus
  readonly evidence: readonly string[]
  readonly blockers: readonly string[]
}

export interface PortableCommercialReadinessEntry {
  readonly productId: string
  readonly checks: readonly PortableCommercialReadinessCheck[]
  readonly readyCount: number
  readonly totalCount: number
  readonly completionPercent: number
  readonly commerciallyReady: boolean
}

export interface PortableCommercialReadinessReport {
  readonly schemaVersion: typeof portableCommercialReadinessSchemaVersion
  readonly entries: readonly PortableCommercialReadinessEntry[]
  readonly commerciallyReadyCount: number
  readonly totalCount: number
  readonly completionPercent: number
  readonly closed: boolean
}

/**
 * Explicit commercial evidence only. Architecture and documentation references are counted only
 * when they directly establish the named delivery boundary. Missing package, integrity, licensing,
 * fulfillment, recovery rehearsal, or clean-environment acceptance evidence remains fail-closed.
 */
const declaredEvidence = Object.freeze<Record<string, Partial<Record<PortableCommercialReadinessDimension, readonly string[]>>>>({
  'provider-hub': Object.freeze({
    'buyer-installation': Object.freeze([
      'docs/portables/provider-hub-security-operations-acceptance.md#5-installation-and-configuration',
    ]),
    'buyer-configuration': Object.freeze([
      'docs/portables/provider-hub-byok-portable.md#dual-audience-contract',
      'docs/portables/provider-hub-security-operations-acceptance.md#53-required-production-configuration-record',
    ]),
    'support-boundary': Object.freeze([
      'docs/portables/provider-hub-security-operations-acceptance.md#1-scope-and-verified-implementation-state',
      'docs/portables/provider-hub-security-operations-acceptance.md#4-compliance-and-evidence-responsibility-matrix',
      'docs/portables/provider-hub-security-operations-acceptance.md#10-permanent-safety-notices',
    ]),
  }),
  // Campaign Studio is intentionally declared with no commercial delivery evidence. Its manifest
  // proves the architecture/product boundary, while licensing-packaging remains future work.
  'campaign-studio': Object.freeze({}),
})

function freezeCheck(
  dimension: PortableCommercialReadinessDimension,
  evidence: readonly string[],
  blockers: readonly string[],
): PortableCommercialReadinessCheck {
  return Object.freeze({
    dimension,
    status: blockers.length === 0 ? 'ready' : 'blocked',
    evidence: Object.freeze([...evidence]),
    blockers: Object.freeze([...blockers]),
  })
}

function createChecks(productId: string): readonly PortableCommercialReadinessCheck[] {
  const architecture = portableArchitectureClosureReport.entries.find(entry => entry.productId === productId)
  const evidence = declaredEvidence[productId] ?? {}

  return Object.freeze(commercialReadinessDimensions.map(dimension => {
    if (dimension === 'architecture') {
      const ready = architecture?.state === 'complete' && architecture.blockers.length === 0
      return freezeCheck(
        dimension,
        ready ? Object.freeze([architecture.coreBoundary, architecture.hostBoundary]) : Object.freeze([]),
        ready ? Object.freeze([]) : Object.freeze(['architecture-not-closed']),
      )
    }

    const dimensionEvidence = evidence[dimension] ?? Object.freeze([])
    return freezeCheck(
      dimension,
      dimensionEvidence,
      dimensionEvidence.length > 0 ? Object.freeze([]) : Object.freeze([`missing-${dimension}-evidence`]),
    )
  }))
}

export function createPortableCommercialReadinessReport(): PortableCommercialReadinessReport {
  const entries = portableProductRegistry.map(descriptor => {
    const checks = createChecks(descriptor.manifest.productId)
    const readyCount = checks.filter(check => check.status === 'ready').length
    const totalCount = checks.length
    return Object.freeze({
      productId: descriptor.manifest.productId,
      checks,
      readyCount,
      totalCount,
      completionPercent: totalCount === 0 ? 0 : Math.round((readyCount / totalCount) * 100),
      commerciallyReady: readyCount === totalCount,
    })
  })

  const commerciallyReadyCount = entries.filter(entry => entry.commerciallyReady).length
  const totalCount = entries.length
  const availableChecks = entries.reduce((total, entry) => total + entry.totalCount, 0)
  const readyChecks = entries.reduce((total, entry) => total + entry.readyCount, 0)

  return Object.freeze({
    schemaVersion: portableCommercialReadinessSchemaVersion,
    entries: Object.freeze(entries),
    commerciallyReadyCount,
    totalCount,
    completionPercent: availableChecks === 0 ? 0 : Math.round((readyChecks / availableChecks) * 100),
    closed: commerciallyReadyCount === totalCount,
  })
}

export const portableCommercialReadinessReport = createPortableCommercialReadinessReport()
