import { createPortableProductDependencyGraph } from './dependency-graph.ts'
import { portableProductRegistry } from './product-registry.ts'
import type { PortableProductDescriptor } from './product-types.ts'

export type PortableReadinessDimension =
  | 'registry'
  | 'manifest'
  | 'documentation'
  | 'architecture'
  | 'dependencies'
  | 'localization'
  | 'testing'
  | 'security'
  | 'packaging-specification'
  | 'licensing-metadata'

export type PortableReadinessStatus = 'ready' | 'attention'

export interface PortableReadinessCheck {
  readonly dimension: PortableReadinessDimension
  readonly status: PortableReadinessStatus
  readonly evidence: readonly string[]
}

export interface PortableProductReadiness {
  readonly productId: string
  readonly displayName: string
  readonly implementationStatus: PortableProductDescriptor['implementationStatus']
  readonly readiness: readonly PortableReadinessCheck[]
  readonly readyForLicensing: boolean
  readonly readyForPackaging: boolean
  readonly readyForDocumentation: boolean
  readonly readyForDeploymentIntegration: boolean
  readonly readyForFutureSale: boolean
}

export interface PortableProductReadinessDashboard {
  readonly schemaVersion: 'portable-product-readiness.v1'
  readonly products: readonly PortableProductReadiness[]
}

export const portableProductReadinessSchemaVersion = 'portable-product-readiness.v1' as const
const requiredLanguages = Object.freeze(['en', 'pt', 'es', 'pl', 'ru'])
const readinessDimensions = Object.freeze([
  'registry', 'manifest', 'documentation', 'architecture', 'dependencies', 'localization', 'testing', 'security', 'packaging-specification', 'licensing-metadata',
] as const)

function frozenStrings(values: readonly string[]): readonly string[] { return Object.freeze([...values]) }
function check(dimension: PortableReadinessDimension, status: PortableReadinessStatus, evidence: readonly string[]): PortableReadinessCheck {
  return Object.freeze({ dimension, status, evidence: frozenStrings(evidence) })
}

/**
 * Derives inspection-only readiness from the validated registry, manifests, graph,
 * and the repository's shared portable-product test coverage. This does not inspect
 * runtime state or execute tests, providers, browsers, packages, or deployments.
 */
export function createPortableProductReadinessDashboard(registry: readonly PortableProductDescriptor[] = portableProductRegistry): PortableProductReadinessDashboard {
  const graph = createPortableProductDependencyGraph(registry)
  const graphProductIds = new Set(graph.nodes.filter(node => node.type === 'product').map(node => node.label))
  const products = registry
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.manifest.productId.localeCompare(right.manifest.productId))
    .map(descriptor => {
      const { manifest } = descriptor
      const hasDocumentation = manifest.documentationReferences.length > 0
      const hasArchitecture = manifest.architectureReferences.length > 0
      const hasDependencies = manifest.dependencies.every(dependency => graph.nodes.some(node => node.label === dependency))
      const hasLanguages = requiredLanguages.every(language => manifest.supportedLanguages.includes(language))
      const hasSecurityBoundary = manifest.exclusions.length > 0
      const hasPackagingSpecification = hasArchitecture && manifest.dependencies.length > 0 && manifest.exclusions.length > 0
      const licensingDeclared = manifest.status === 'live' && manifest.licensingAvailable && descriptor.implementationStatus === 'implemented'
      const readiness = Object.freeze([
        check('registry', graphProductIds.has(manifest.productId) ? 'ready' : 'attention', [`registry product: ${manifest.productId}`]),
        check('manifest', manifest.displayName.length > 0 && manifest.longDescription.length > 0 ? 'ready' : 'attention', ['validated manifest identity and descriptions']),
        check('documentation', hasDocumentation ? 'ready' : 'attention', manifest.documentationReferences),
        check('architecture', hasArchitecture ? 'ready' : 'attention', manifest.architectureReferences),
        check('dependencies', hasDependencies ? 'ready' : 'attention', manifest.dependencies),
        check('localization', hasLanguages ? 'ready' : 'attention', manifest.supportedLanguages),
        check('testing', 'ready', ['tests/portableProductRegistry.node.test.ts', 'tests/portableProductManifest.node.test.ts', 'tests/portableProductDependencyGraph.node.test.ts']),
        check('security', hasSecurityBoundary ? 'ready' : 'attention', manifest.exclusions),
        check('packaging-specification', hasPackagingSpecification ? 'ready' : 'attention', ['architecture references', 'dependencies', 'exclusions']),
        check('licensing-metadata', licensingDeclared ? 'ready' : 'attention', [`status: ${manifest.status}`, `licensingAvailable: ${String(manifest.licensingAvailable)}`, `implementationStatus: ${descriptor.implementationStatus}`]),
      ])
      const ready = (dimension: PortableReadinessDimension) => readiness.find(item => item.dimension === dimension)?.status === 'ready'
      return Object.freeze({
        productId: manifest.productId,
        displayName: manifest.displayName,
        implementationStatus: descriptor.implementationStatus,
        readiness,
        readyForLicensing: ready('licensing-metadata'),
        readyForPackaging: ready('packaging-specification'),
        readyForDocumentation: ready('documentation'),
        readyForDeploymentIntegration: ready('architecture') && ready('dependencies') && ready('security'),
        readyForFutureSale: ready('licensing-metadata') && ready('packaging-specification') && ready('documentation') && ready('dependencies') && ready('security'),
      })
    })
  return Object.freeze({ schemaVersion: portableProductReadinessSchemaVersion, products: Object.freeze(products) })
}

/** Canonical static readiness view for the current portable product registry. */
export const portableProductReadinessDashboard = createPortableProductReadinessDashboard()

export { readinessDimensions }
