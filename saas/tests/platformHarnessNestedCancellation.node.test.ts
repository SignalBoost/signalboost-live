import assert from 'node:assert/strict'
import test from 'node:test'
import { currentHarnessExecutionContext, withHarnessExecutionContext } from '../platform-harness/runtime/execution-context.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'

function manifest(runId: string, deadlineAt: string, parent?: HarnessManifest): HarnessManifest {
  return {
    runId, objective: 'nested cancellation regression',
    identity: { agentId: 'test', role: 'specialist', tenantId: 'itmounts', portableId: 'test' },
    profile: 'production',
    environment: { environmentId: 'itmounts-production', class: 'production' },
    capabilities: [], authorityManifestRef: 'host://' + runId,
    ...(parent ? { parent: { runId: parent.runId, authorityManifestRef: parent.authorityManifestRef } } : {}),
    limits: { deadlineMs: 10_000, maxConcurrency: 1 },
    deadlineAt, learningFeedbackAllowed: false,
  }
}

test('nested harness observes parent cancellation while child is still active', async () => {
  const deadlineAt = new Date(Date.now() + 10_000).toISOString()
  const parent = manifest('parent', deadlineAt)
  const child = manifest('child', deadlineAt, parent)
  const parentAbort = new AbortController()
  const childAbort = new AbortController()
  await withHarnessExecutionContext(parent, parentAbort.signal, async () => {
    await withHarnessExecutionContext(child, childAbort.signal, async () => {
      assert.equal(currentHarnessExecutionContext()?.signal.aborted, false)
      parentAbort.abort(new Error('parent cancelled'))
      assert.equal(currentHarnessExecutionContext()?.signal.aborted, true)
      assert.equal(childAbort.signal.aborted, false)
    })
  })
})

test('nested harness observes child cancellation without aborting parent', async () => {
  const deadlineAt = new Date(Date.now() + 10_000).toISOString()
  const parent = manifest('parent2', deadlineAt)
  const child = manifest('child2', deadlineAt, parent)
  const parentAbort = new AbortController()
  const childAbort = new AbortController()
  await withHarnessExecutionContext(parent, parentAbort.signal, async () => {
    await withHarnessExecutionContext(child, childAbort.signal, async () => {
      childAbort.abort(new Error('child cancelled'))
      assert.equal(currentHarnessExecutionContext()?.signal.aborted, true)
      assert.equal(parentAbort.signal.aborted, false)
    })
  })
})
