import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  listPublicPortableProducts,
  portableProductDependencyGraph,
  portableProductManifests,
  portableProductRegistry,
  validatePortableProductManifests,
} from '../lib/portable-products/index.ts'

test('all homepage products have immutable, serializable manifests referenced by the registry', () => {
  const manifestIds = new Set(portableProductManifests.map(manifest => manifest.productId))
  assert.ok(Object.isFrozen(portableProductManifests))
  for (const product of listPublicPortableProducts()) assert.ok(manifestIds.has(product.manifest.productId))
  for (const product of portableProductRegistry) {
    assert.ok(portableProductManifests.includes(product.manifest)); assert.ok(Object.isFrozen(product.manifest)); assert.doesNotThrow(() => JSON.stringify(product.manifest))
    for (const field of ['supportedLanguages', 'targetAudience', 'requiredCapabilities', 'optionalCapabilities', 'dependencies', 'exclusions', 'architectureReferences', 'documentationReferences', 'futureFeatures'] as const) assert.ok(Object.isFrozen(product.manifest[field]))
    assert.ok(product.manifest.architectureReferences.length > 0); assert.ok(product.manifest.documentationReferences.length > 0)
  }
})

test('Provider Hub manifest and generated graph reflect implemented core and host boundaries', () => {
  const providerHub = portableProductManifests.find(manifest => manifest.productId === 'provider-hub')
  assert.ok(providerHub)
  assert.ok(providerHub.architectureReferences.includes('provider-hub-core'))
  assert.ok(providerHub.architectureReferences.includes('provider-hub-host'))
  assert.equal(providerHub.futureFeatures.includes('provider-hub-core-host-extraction'), false)

  const productNode = portableProductDependencyGraph.nodes.find(node => node.type === 'product' && node.label === 'provider-hub')
  assert.ok(productNode)
  for (const architecture of ['provider-hub-core', 'provider-hub-host']) {
    const architectureNode = portableProductDependencyGraph.nodes.find(node => node.type === 'architecture' && node.label === architecture)
    assert.ok(architectureNode)
    assert.ok(portableProductDependencyGraph.edges.some(edge => edge.type === 'references_architecture' && edge.source === productNode.id && edge.target === architectureNode.id))
  }
})

test('manifest validation detects duplicate IDs, references, dependencies, and mutable arrays', () => {
  const original = portableProductManifests[0]
  const duplicateId = Object.freeze({ ...original, supportedLanguages: original.supportedLanguages, targetAudience: original.targetAudience, requiredCapabilities: original.requiredCapabilities, optionalCapabilities: original.optionalCapabilities, dependencies: original.dependencies, exclusions: original.exclusions, architectureReferences: original.architectureReferences, documentationReferences: original.documentationReferences, futureFeatures: original.futureFeatures })
  assert.throws(() => validatePortableProductManifests(Object.freeze([original, duplicateId])), /duplicate productId/)
  const duplicateReferences = Object.freeze({ ...original, architectureReferences: Object.freeze([original.architectureReferences[0], original.architectureReferences[0]]) })
  assert.throws(() => validatePortableProductManifests(Object.freeze([duplicateReferences])), /architectureReferences contains duplicate/)
  const mutableDependencies = Object.freeze({ ...original, dependencies: [...original.dependencies] })
  assert.throws(() => validatePortableProductManifests(Object.freeze([mutableDependencies])), /dependencies must be a frozen array/)
})

test('manifest modules remain execution-free and do not import browser, runtime, or provider SDKs', () => {
  for (const path of ['providerHub', 'campaignStudio', 'integrationsHub', 'videoMaker', 'controlCenter', 'marketingSales', 'pressMedia', 'portableChiefOfStaff', 'browserAgentEcosystem', 'agentOperationsPlatform', 'selfHealingSupervisor']) {
    const source = readFileSync(new URL(`../lib/portable-products/manifests/${path}.ts`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /=>|\bfunction\b|process\.env|from ['"](?:.*(?:playwright|puppeteer|browser-runtime|browser-provider|node:fs|openai|anthropic|supabase|sdk)|.*provider.*sdk)['"]|fetch\s*\(/i)
  }
})
