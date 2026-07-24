import type { PortableProductDependencyGraph } from './dependency-graph.ts'

const nodeTypes = new Set(['product', 'architecture', 'capability', 'documentation'])
const edgeTypes = new Set(['references_architecture', 'requires_capability', 'optionally_supports_capability', 'references_documentation', 'depends_on_architecture', 'depends_on_product'])

function fail(message: string): never { throw new Error(`Invalid portable product dependency graph: ${message}`) }

/** Validates the graph's detached, metadata-only shape without resolving any references. */
export function validatePortableProductDependencyGraph(graph: PortableProductDependencyGraph): void {
  if (!graph || typeof graph !== 'object' || !Object.isFrozen(graph)) fail('graph must be frozen')
  if (graph.schemaVersion !== 'portable-product-dependency-graph.v1') fail('unsupported schema version')
  if (!Array.isArray(graph.nodes) || !Object.isFrozen(graph.nodes) || !Array.isArray(graph.edges) || !Object.isFrozen(graph.edges)) fail('nodes and edges must be frozen arrays')
  const nodeIds = new Set<string>()
  for (const node of graph.nodes) {
    if (!node || !Object.isFrozen(node) || typeof node.id !== 'string' || typeof node.label !== 'string' || !nodeTypes.has(node.type)) fail('invalid node')
    if (nodeIds.has(node.id)) fail(`duplicate node ${node.id}`)
    nodeIds.add(node.id)
  }
  const edgeIds = new Set<string>()
  for (const edge of graph.edges) {
    if (!edge || !Object.isFrozen(edge) || typeof edge.id !== 'string' || !edgeTypes.has(edge.type) || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) fail('invalid edge')
    const source = graph.nodes.find(node => node.id === edge.source)
    const target = graph.nodes.find(node => node.id === edge.target)
    if (source?.type !== 'product') fail('edge source must be a product')
    const targetType = edge.type === 'requires_capability' || edge.type === 'optionally_supports_capability'
      ? 'capability'
      : edge.type === 'references_documentation'
        ? 'documentation'
        : edge.type === 'depends_on_product'
          ? 'product'
          : 'architecture'
    if (target?.type !== targetType) fail('edge target does not match its type')
    if (edgeIds.has(edge.id)) fail(`duplicate edge ${edge.id}`)
    edgeIds.add(edge.id)
  }
}
