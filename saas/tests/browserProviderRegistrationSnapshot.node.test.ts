import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BrowserProviderRegistry,
  VercelBrowserAdapter,
} from '../lib/browser-provider/index.ts'

test('provider registration snapshots support-method results instead of retaining mutable closures', () => {
  let supportsReadOnlyExecution = true
  let supportsReadOnlyInspection = true
  let supportsAutoFailover = false
  let supportsBrowserOnDemand = true
  let supportsSandbox = true
  let supportsProduction = false

  const rawAdapter = {
    ...VercelBrowserAdapter,
    supportsExecutionMode: () => supportsReadOnlyExecution,
    supportsReadOnlyInspection: () => supportsReadOnlyInspection,
    supportsAutoFailover: () => supportsAutoFailover,
    supportsBrowserOnDemand: () => supportsBrowserOnDemand,
    supportsSandbox: () => supportsSandbox,
    supportsProduction: () => supportsProduction,
  }

  const registry = new BrowserProviderRegistry()
  const registered = registry.register(rawAdapter)

  supportsReadOnlyExecution = false
  supportsReadOnlyInspection = false
  supportsAutoFailover = true
  supportsBrowserOnDemand = false
  supportsSandbox = false
  supportsProduction = true

  assert.equal(registered.supportsExecutionMode('read_only'), true)
  assert.equal(registered.supportsReadOnlyInspection(), true)
  assert.equal(registered.supportsAutoFailover(), false)
  assert.equal(registered.supportsBrowserOnDemand(), true)
  assert.equal(registered.supportsSandbox(), true)
  assert.equal(registered.supportsProduction(), false)

  const stored = registry.get('vercel')
  assert.equal(stored.supportsExecutionMode('read_only'), true)
  assert.equal(stored.supportsReadOnlyInspection(), true)
  assert.equal(stored.supportsAutoFailover(), false)
  assert.equal(stored.supportsBrowserOnDemand(), true)
  assert.equal(stored.supportsSandbox(), true)
  assert.equal(stored.supportsProduction(), false)
})
