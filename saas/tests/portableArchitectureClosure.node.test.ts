import assert from 'node:assert/strict'
import test from 'node:test'

import { createPortableArchitectureClosureReport, portableArchitectureClosureReport } from '../lib/portable-products/architecture-closure.ts'
import { portableProductRegistry } from '../lib/portable-products/index.ts'

test('portable architecture closure report is deterministic, immutable, and complete in coverage', () => {
  const first = createPortableArchitectureClosureReport()
  const second = createPortableArchitectureClosureReport()
  assert.deepEqual(first, second)
  assert.deepEqual(first, portableArchitectureClosureReport)
  assert.equal(first.totalCount, portableProductRegistry.length)
  assert.equal(new Set(first.entries.map(entry => entry.productId)).size, portableProductRegistry.length)
  assert.deepEqual(first.entries.map(entry => entry.productId), portableProductRegistry.map(entry => entry.manifest.productId))
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.entries))
  assert.ok(first.entries.every(entry => Object.isFrozen(entry) && Object.isFrozen(entry.blockers)))
})

test('implemented products require explicit core and host boundaries before architecture completion', () => {
  const report = createPortableArchitectureClosureReport()
  for (const entry of report.entries.filter(item => item.state === 'complete')) {
    assert.ok(entry.coreBoundary)
    assert.ok(entry.hostBoundary)
    assert.deepEqual(entry.blockers, [])
    const descriptor = portableProductRegistry.find(item => item.manifest.productId === entry.productId)
    assert.equal(descriptor?.implementationStatus, 'implemented')
  }
})

test('preview and descriptor products remain fail-closed', () => {
  const report = createPortableArchitectureClosureReport()
  const providerHub = report.entries.find(entry => entry.productId === 'provider-hub')
  const browserAgents = report.entries.find(entry => entry.productId === 'browser-agent-ecosystem')
  assert.equal(providerHub?.state, 'partial')
  assert.ok((providerHub?.blockers.length ?? 0) > 0)
  assert.equal(browserAgents?.state, 'descriptor-only')
  assert.ok((browserAgents?.blockers.length ?? 0) > 0)
  assert.equal(report.closed, false)
  assert.equal(report.completionPercent, Math.round((report.completeCount / report.totalCount) * 100))
})
