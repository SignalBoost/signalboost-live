import { portableProductRegistry } from './product-registry.ts'
import type { PortableProductDescriptor } from './product-types.ts'
import { validatePortableProductDependencyGraph } from './dependency-graph-validation.ts'

/** Inspection-only node categories derived from portable product manifests. */
export type PortableGraphNodeType = 'product' | 'architecture' | 'capability' | 'documentation'

/** The manifest field that establishes an inspection-only graph relationship. */
export type PortableGraphEdgeType =
  | 'references_architecture'
  | 'requires_capability'
  | 'optionally_supports_capability'
  | 'references_documentation'
  | 'depends_on_architecture'
  | 'depends_on_product'

export interface PortableGraphNode {
  readonly id: string
  readonly type: PortableGraphNodeType
  readonly label: string
}

export interface PortableGraphEdge {
  readonly id: string
  readonly type: PortableGraphEdgeType
  readonly source: string
  readonly target: string
}

export interface PortableProductDependencyGraph {
  readonly schemaVersion: 'portable-product-dependency-graph.v1'
  readonly nodes: readonly PortableGraphNode[]
  readonly edges: readonly PortableGraphEdge[]
}

export const portableProductDependencyGraphSchemaVersion = 'portable-product-dependency-graph.v1' as const

function nodeId(type: PortableGraphNodeType, value: string): string { return `${type}:${encodeURIComponent(value)}` }
function edgeId(type: PortableGraphEdgeType, source: string, target: string): string { return `${type}:${source}->${target}` }
function compareById<T extends { readonly id: string }>(left: T, right: T): number { return left.id.localeCompare(right.id) }

function addNode(nodes: Map<string, PortableGraphNode>, type: PortableGraphNodeType, label: string): string {
  const id = nodeId(type, label)
  if (!nodes.has(id)) nodes.set(id, Object.freeze({ id, type, label }))
  return id
}

function addEdge(edges: Map<string, PortableGraphEdge>, type: PortableGraphEdgeType, source: string, target: string): void {
  const id = edgeId(type, source, target)
  if (!edges.has(id)) edges.set(id, Object.freeze({ id, type, source, target }))
}

/**
 * Builds a deterministic, detached, read-only graph from registry-backed manifests.
 *
 * Dependencies that name another registered product become product edges. All other
 * dependencies remain visible as architecture nodes, rather than inventing a second
 * product catalog for concepts that are not portable products.
 */
export function createPortableProductDependencyGraph(registry: readonly PortableProductDescriptor[] = portableProductRegistry): PortableProductDependencyGraph {
  const nodes = new Map<string, PortableGraphNode>()
  const edges = new Map<string, PortableGraphEdge>()
  const productsById = new Map(registry.map(descriptor => [descriptor.manifest.productId, descriptor]))

  for (const { manifest } of registry) {
    const productNodeId = addNode(nodes, 'product', manifest.productId)
    for (const reference of manifest.architectureReferences) addEdge(edges, 'references_architecture', productNodeId, addNode(nodes, 'architecture', reference))
    for (const capability of manifest.requiredCapabilities) addEdge(edges, 'requires_capability', productNodeId, addNode(nodes, 'capability', capability))
    for (const capability of manifest.optionalCapabilities) addEdge(edges, 'optionally_supports_capability', productNodeId, addNode(nodes, 'capability', capability))
    for (const reference of manifest.documentationReferences) addEdge(edges, 'references_documentation', productNodeId, addNode(nodes, 'documentation', reference))
    for (const dependency of manifest.dependencies) {
      const target = productsById.has(dependency)
        ? addNode(nodes, 'product', dependency)
        : addNode(nodes, 'architecture', dependency)
      addEdge(edges, productsById.has(dependency) ? 'depends_on_product' : 'depends_on_architecture', productNodeId, target)
    }
  }

  return Object.freeze({
    schemaVersion: portableProductDependencyGraphSchemaVersion,
    nodes: Object.freeze([...nodes.values()].sort(compareById)),
    edges: Object.freeze([...edges.values()].sort(compareById)),
  })
}

/** Canonical inspection graph for all registry-backed portable products. */
export const portableProductDependencyGraph = createPortableProductDependencyGraph()
validatePortableProductDependencyGraph(portableProductDependencyGraph)
