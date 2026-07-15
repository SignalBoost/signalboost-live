import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSandboxBrowserTask, SANDBOX_ADAPTER_ID } from '../lib/browser-runtime/sandbox-adapter.ts'

const base = {
  taskId: 'task-sandbox-1',
  incidentId: 'incident-sandbox-1',
  baseUrl: 'http://localhost:4173/path-is-ignored',
  issuedAt: '2026-07-15T19:00:00.000Z',
  expiresAt: '2026-07-15T20:00:00.000Z',
  approvalToken: 'signed-token',
}

test('builds a bounded sandbox task ending at an approval checkpoint', () => {
  const task = buildSandboxBrowserTask(base)

  assert.equal(task.provider, 'sandbox')
  assert.equal(task.adapterId, SANDBOX_ADAPTER_ID)
  assert.equal(task.mode, 'observe')
  assert.deepEqual(task.allowedOrigins, ['http://localhost:4173'])
  assert.equal(task.steps[0]?.kind, 'navigate')
  assert.equal(task.steps.at(-1)?.kind, 'checkpoint')
  assert.equal(task.steps.some(step => step.kind === 'click' && step.selector === '[data-action="protected-save"]'), false)
})

test('prepares the harmless sandbox value by reference before evidence and approval', () => {
  const task = buildSandboxBrowserTask(base)
  const fills = task.steps.filter(step => step.kind === 'fill')

  assert.deepEqual(
    fills.map(step => step.kind === 'fill' ? step.valueRef : ''),
    [
      'sandbox://credentials/email',
      'sandbox://credentials/password',
      'sandbox://config/test-environment-value',
    ],
  )

  const fillIndex = task.steps.findIndex(step => step.id === 'fill-test-value')
  const screenshotIndex = task.steps.findIndex(step => step.id === 'capture-ready')
  const checkpointIndex = task.steps.findIndex(step => step.id === 'approval-checkpoint')

  assert.ok(fillIndex >= 0)
  assert.ok(screenshotIndex > fillIndex)
  assert.ok(checkpointIndex > screenshotIndex)
})

test('rejects non-http sandbox URLs', () => {
  assert.throws(
    () => buildSandboxBrowserTask({ ...base, baseUrl: 'file:///tmp/sandbox.html' }),
    /Unsupported sandbox protocol/,
  )
})

test('allows prepare_change but never execute_change input', () => {
  const task = buildSandboxBrowserTask({ ...base, mode: 'prepare_change' })
  assert.equal(task.mode, 'prepare_change')
})
