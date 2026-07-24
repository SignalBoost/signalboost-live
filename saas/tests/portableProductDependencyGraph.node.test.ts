import test from 'node:test'
import assert from 'node:assert/strict'
import { createPortableProductDependencyGraph, portableProductDependencyGraph, portableProductDependencyGraphSchemaVersion, portableProductRegistry, validatePortableProductDependencyGraph } from '../lib/portable-products/index.ts'

test('portable product dependency graph is deterministic, frozen, and registry-driven', () => {
  const first = createPortableProductDependencyGraph(); const second = createPortableProductDependencyGraph()
  assert.equal(first.schemaVersion, portableProductDependencyGraphSchemaVersion); assert.deepEqual(first, second); assert.notEqual(first, second)
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.nodes) && Object.isFrozen(first.edges)); assert.doesNotThrow(() => JSON.stringify(first))
  assert.deepEqual(first.nodes.filter(node => node.type === 'product').map(node => node.label).sort(), portableProductRegistry.map(entry => entry.manifest.productId).sort())
  assert.ok(first.edges.some(edge => edge.type === 'references_architecture' && edge.source === 'product:campaign-studio' && edge.target === 'architecture:cosa'))
  assert.ok(first.edges.some(edge => edge.type === 'requires_capability' && edge.target === 'capability:approval-gates'))
  assert.ok(first.edges.some(edge => edge.type === 'references_documentation' && edge.target === 'documentation:saas%2Fdocs%2Fdeveloper-guide.md'))
  assert.ok(first.edges.some(edge => edge.type === 'depends_on_architecture' && edge.target === 'architecture:buyer-supplied-ai-key'))
})

test('dependency graph validation rejects mutable nodes and unresolved edges', () => {
  validatePortableProductDependencyGraph(portableProductDependencyGraph)
  const graph = portableProductDependencyGraph
  assert.throws(() => validatePortableProductDependencyGraph(Object.freeze({ ...graph, nodes: [...graph.nodes] })), /nodes and edges must be frozen arrays/)
  const invalidEdge = Object.freeze({ ...graph.edges[0], target: 'product:missing' })
  assert.throws(() => validatePortableProductDependencyGraph(Object.freeze({ ...graph, edges: Object.freeze([invalidEdge, ...graph.edges.slice(1)]) })), /invalid edge/)
})
