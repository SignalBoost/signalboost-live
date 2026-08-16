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

test('Provider Hub is architecture-complete while commercial maturity remains preview', () => {
  const report = createPortableArchitectureClosureReport()
  const providerHub = report.entries.find(entry => entry.productId === 'provider-hub')
  const descriptor = portableProductRegistry.find(entry => entry.manifest.productId === 'provider-hub')
  assert.equal(providerHub?.state, 'complete')
  assert.deepEqual(providerHub?.blockers, [])
  assert.equal(descriptor?.implementationStatus, 'implemented')
  assert.equal(descriptor?.manifest.status, 'preview')
  assert.equal(descriptor?.route, '/dashboard/provider-hub')
})

test('Portable COS is architecture-complete while licensing remains disabled', () => {
  const report = createPortableArchitectureClosureReport()
  const cos = report.entries.find(entry => entry.productId === 'portable-ai-chief-of-staff')
  const descriptor = portableProductRegistry.find(entry => entry.manifest.productId === 'portable-ai-chief-of-staff')
  assert.equal(cos?.state, 'complete')
  assert.deepEqual(cos?.blockers, [])
  assert.equal(cos?.coreBoundary, 'saas/lib/cos')
  assert.equal(cos?.hostBoundary, 'saas/lib/cos/host.ts')
  assert.equal(descriptor?.implementationStatus, 'implemented')
  assert.equal(descriptor?.manifest.status, 'preview')
  assert.equal(descriptor?.manifest.licensingAvailable, false)
  assert.equal(descriptor?.route, '/dashboard/cos-mining')
})

test('Agent Operations is architecture-complete while runtime inputs remain buyer-supplied', () => {
  const report = createPortableArchitectureClosureReport()
  const agentOperations = report.entries.find(entry => entry.productId === 'agent-operations-platform')
  const descriptor = portableProductRegistry.find(entry => entry.manifest.productId === 'agent-operations-platform')
  assert.equal(agentOperations?.state, 'complete')
  assert.deepEqual(agentOperations?.blockers, [])
  assert.equal(agentOperations?.coreBoundary, 'saas/lib/agent-runtime')
  assert.equal(agentOperations?.hostBoundary, 'saas/agent-operations-host')
  assert.equal(descriptor?.implementationStatus, 'implemented')
  assert.equal(descriptor?.manifest.status, 'preview')
  assert.equal(descriptor?.manifest.licensingAvailable, false)
})

// Flipped off preview Jul 27 2026 on evidence, not on a badge change: the acceptance
// scenario was run against the platform's real host adapter and passed all five checks
// across all three risk categories — safe step executed, dangerous step paused,
// approver notified, buyer branding used, audit trail emitted. The assertions below
// deliberately still pin status and licensing BY NAME, so a future change to either is
// a decision someone makes rather than a side effect.
test('Self-Healing Supervisor is architecture-complete and cleared for licensing', () => {
  const report = createPortableArchitectureClosureReport()
  const supervisor = report.entries.find(entry => entry.productId === 'self-healing-supervisor')
  const descriptor = portableProductRegistry.find(entry => entry.manifest.productId === 'self-healing-supervisor')
  assert.equal(supervisor?.state, 'complete')
  assert.deepEqual(supervisor?.blockers, [])
  assert.equal(supervisor?.coreBoundary, 'saas/lib/supervisor/portable')
  assert.equal(supervisor?.hostBoundary, 'HostContext + createSupervisorDispatcher')
  assert.equal(descriptor?.implementationStatus, 'implemented')
  assert.equal(descriptor?.manifest.status, 'live')
  assert.equal(descriptor?.manifest.licensingAvailable, true)
  assert.equal(descriptor?.route, '/self-healing-supervisor')
})

test('Browser Agent Ecosystem is architecture-complete while production execution remains excluded', () => {
  const report = createPortableArchitectureClosureReport()
  const browserAgents = report.entries.find(entry => entry.productId === 'browser-agent-ecosystem')
  const descriptor = portableProductRegistry.find(entry => entry.manifest.productId === 'browser-agent-ecosystem')
  assert.equal(browserAgents?.state, 'complete')
  assert.deepEqual(browserAgents?.blockers, [])
  assert.equal(browserAgents?.coreBoundary, 'saas/lib/portable-browser')
  assert.equal(browserAgents?.hostBoundary, 'PortableBrowserRuntimeCoordinator + buyer-injected ports')
  assert.equal(descriptor?.implementationStatus, 'implemented')
  assert.equal(descriptor?.manifest.status, 'preview')
  assert.equal(descriptor?.manifest.licensingAvailable, false)
  assert.ok(descriptor?.manifest.exclusions.includes('production-browser-execution'))
  assert.equal(descriptor?.route, undefined)
})

test('all registered portable architecture boundaries are closed', () => {
  const report = createPortableArchitectureClosureReport()
  assert.equal(report.completeCount, report.totalCount)
  assert.equal(report.completionPercent, 100)
  assert.equal(report.closed, true)
})
