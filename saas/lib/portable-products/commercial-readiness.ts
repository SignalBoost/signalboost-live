import { portableProductRegistry } from './product-registry.ts'

export const portableCommercialReadinessSchemaVersion = 'portable-commercial-readiness.v1' as const

export const portableCommercialEvidenceKeys = Object.freeze([
  'distribution-package',
  'integrity-manifest',
  'buyer-installation-guide',
  'licensing-boundary',
  'fulfillment-handoff',
  'upgrade-rollback-recovery',
  'buyer-provider-configuration',
  'clean-environment-acceptance',
  'buyer-acceptance-evidence',
  'support-ownership-limitations',
] as const)

export type PortableCommercialEvidenceKey = (typeof portableCommercialEvidenceKeys)[number]
export type PortableCommercialReadinessState = 'ready' | 'partial' | 'not-ready'

export interface PortableCommercialReadinessEntry {
  readonly productId: string
  readonly state: PortableCommercialReadinessState
  readonly evidence: readonly PortableCommercialEvidenceKey[]
  readonly missingEvidence: readonly PortableCommercialEvidenceKey[]
  readonly licensingAvailable: boolean
  readonly blockers: readonly string[]
}

export interface PortableCommercialReadinessReport {
  readonly schemaVersion: typeof portableCommercialReadinessSchemaVersion
  readonly entries: readonly PortableCommercialReadinessEntry[]
  readonly readyCount: number
  readonly totalCount: number
  readonly completionPercent: number
  readonly commerciallyReady: boolean
}

const declaredEvidence = Object.freeze<Record<string, readonly PortableCommercialEvidenceKey[]>>({})

function freezeEntry(productId: string, licensingAvailable: boolean): PortableCommercialReadinessEntry {
  const evidence = Object.freeze([...(declaredEvidence[productId] ?? [])])
  const evidenceSet = new Set<PortableCommercialEvidenceKey>(evidence)
  const missingEvidence = Object.freeze(portableCommercialEvidenceKeys.filter(key => !evidenceSet.has(key)))
  const blockers = Object.freeze([
    ...missingEvidence.map(key => `missing:${key}`),
    ...(licensingAvailable ? [] : ['licensing-unavailable']),
  ])
  const state: PortableCommercialReadinessState = blockers.length === 0
    ? 'ready'
    : evidence.length === 0
      ? 'not-ready'
      : 'partial'

  return Object.freeze({ productId, state, evidence, missingEvidence, licensingAvailable, blockers })
}

export function createPortableCommercialReadinessReport(): PortableCommercialReadinessReport {
  const entries = Object.freeze(portableProductRegistry.map(descriptor => freezeEntry(
    descriptor.manifest.productId,
    descriptor.manifest.licensingAvailable,
  )))
  const readyCount = entries.filter(entry => entry.state === 'ready' && entry.blockers.length === 0).length
  const totalCount = entries.length

  return Object.freeze({
    schemaVersion: portableCommercialReadinessSchemaVersion,
    entries,
    readyCount,
    totalCount,
    completionPercent: totalCount === 0 ? 0 : Math.round((readyCount / totalCount) * 100),
    commerciallyReady: readyCount === totalCount,
  })
}

export const portableCommercialReadinessReport = createPortableCommercialReadinessReport()
