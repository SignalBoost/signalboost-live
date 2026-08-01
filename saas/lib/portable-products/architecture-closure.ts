// saas/lib/portable-products/architecture-closure.ts
import { portableProductRegistry } from './product-registry.ts'

export const portableArchitectureClosureSchemaVersion = 'portable-architecture-closure.v1' as const

export type PortableArchitectureState = 'complete' | 'partial' | 'descriptor-only'

export interface PortableArchitectureEntry {
  readonly productId: string
  readonly coreBoundary: string
  readonly hostBoundary: string
  readonly state: PortableArchitectureState
  readonly blockers: readonly string[]
}

export interface PortableArchitectureClosureReport {
  readonly schemaVersion: typeof portableArchitectureClosureSchemaVersion
  readonly entries: readonly PortableArchitectureEntry[]
  readonly completeCount: number
  readonly totalCount: number
  readonly completionPercent: number
  readonly closed: boolean
}

const declared = Object.freeze<Record<string, Omit<PortableArchitectureEntry, 'productId'>>>({
  'provider-hub': { coreBoundary: 'saas/provider-hub-core', hostBoundary: 'saas/provider-hub-host', state: 'complete', blockers: Object.freeze([]) },
  'campaign-studio': { coreBoundary: 'saas/lib/agency', hostBoundary: 'saas/app/agency', state: 'complete', blockers: Object.freeze([]) },
  'integrations-hub': { coreBoundary: 'saas/lib/provider-framework', hostBoundary: 'saas/app/dashboard/integrations', state: 'complete', blockers: Object.freeze([]) },
  'video-maker': { coreBoundary: 'saas/render-core', hostBoundary: 'saas/render-host', state: 'complete', blockers: Object.freeze([]) },
  'control-center': { coreBoundary: 'saas/console-core', hostBoundary: 'saas/console-host', state: 'complete', blockers: Object.freeze([]) },
  'marketing-sales': { coreBoundary: 'saas/marketing-sales-core', hostBoundary: 'saas/marketing-sales-host', state: 'complete', blockers: Object.freeze([]) },
  'press-media': { coreBoundary: 'saas/press-media-core', hostBoundary: 'saas/press-media-host', state: 'complete', blockers: Object.freeze([]) },
  'portable-ai-chief-of-staff': { coreBoundary: 'saas/lib/cos', hostBoundary: 'saas/lib/cos/host.ts', state: 'complete', blockers: Object.freeze([]) },
  'browser-agent-ecosystem': { coreBoundary: 'saas/lib/portable-browser', hostBoundary: 'PortableBrowserRuntimeCoordinator + buyer-injected ports', state: 'complete', blockers: Object.freeze([]) },
  'agent-operations-platform': { coreBoundary: 'saas/lib/agent-runtime', hostBoundary: 'saas/agent-operations-host', state: 'complete', blockers: Object.freeze([]) },
  'self-healing-supervisor': { coreBoundary: 'saas/lib/supervisor/portable', hostBoundary: 'HostContext + createSupervisorDispatcher', state: 'complete', blockers: Object.freeze([]) },
})

function freezeEntry(productId: string, value: Omit<PortableArchitectureEntry, 'productId'>): PortableArchitectureEntry {
  return Object.freeze({ productId, coreBoundary: value.coreBoundary, hostBoundary: value.hostBoundary, state: value.state, blockers: Object.freeze([...value.blockers]) })
}

export function createPortableArchitectureClosureReport(): PortableArchitectureClosureReport {
  const entries = portableProductRegistry.map(descriptor => {
    const productId = descriptor.manifest.productId
    const declaration = declared[productId]
    if (!declaration) return freezeEntry(productId, { coreBoundary: '', hostBoundary: '', state: 'partial', blockers: Object.freeze(['missing-architecture-declaration']) })
    if (descriptor.implementationStatus === 'descriptor_only' && declaration.state !== 'descriptor-only') return freezeEntry(productId, { ...declaration, state: 'descriptor-only', blockers: Object.freeze([...declaration.blockers, 'registry-descriptor-only']) })
    if (descriptor.implementationStatus !== 'implemented' && declaration.state === 'complete') return freezeEntry(productId, { ...declaration, state: 'partial', blockers: Object.freeze([...declaration.blockers, 'registry-not-implemented']) })
    return freezeEntry(productId, declaration)
  })
  const completeCount = entries.filter(entry => entry.state === 'complete' && entry.blockers.length === 0 && entry.coreBoundary && entry.hostBoundary).length
  const totalCount = entries.length
  return Object.freeze({
    schemaVersion: portableArchitectureClosureSchemaVersion,
    entries: Object.freeze(entries),
    completeCount,
    totalCount,
    completionPercent: totalCount === 0 ? 0 : Math.round((completeCount / totalCount) * 100),
    closed: completeCount === totalCount,
  })
}

export const portableArchitectureClosureReport = createPortableArchitectureClosureReport()
