import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSandboxBrowserTask,
  buildSandboxProtectedSaveTask,
  SANDBOX_ADAPTER_ID,
} from '../lib/browser-runtime/sandbox-adapter.ts'

const base = {
  taskId: 'task-sandbox-1',
  incidentId: 'incident-sandbox-1',
  baseUrl: 'http://localhost:4173/path-is-ignored',
  issuedAt: '2026-07-15T19:00:00.000Z',
  expiresAt: '2026-07-15T20:00:00.000Z',
  approvalToken: 'signed-token',
}

test('builds one bounded two-phase task with protected steps after the approval checkpoint', () => {
  const task = buildSandboxBrowserTask(base)
  const checkpointIndex = task.steps.findIndex(step => step.kind === 'checkpoint')
  const protectedSaveIndex = task.steps.findIndex(
    step => step.kind === 'click' && step.selector === '[data-action="protected-save"]',
  )

  assert.equal(task.provider, 'sandbox')
  assert.equal(task.adapterId, SANDBOX_ADAPTER_ID)
  assert.equal(task.mode, 'prepare_change')
  assert.deepEqual(task.allowedOrigins, ['http://localhost:4173'])
  assert.equal(task.steps[0]?.kind, 'navigate')
  assert.ok(checkpointIndex >= 0)
  assert.ok(protectedSaveIndex > checkpointIndex)
  assert.equal(
    task.steps.slice(0, checkpointIndex).some(
      step => step.kind === 'click' && step.selector === '[data-action="protected-save"]',
    ),
    false,
  )
  assert.equal(task.metadata?.phase, 'two-phase-resumable')
})

test('uses secret references rather than literal credential or setting values', () => {
  const task = buildSandboxBrowserTask(base)
  const fills = task.steps.filter(step => step.kind === 'fill')

  assert.deepEqual(
    fills.map(step => step.kind === 'fill' ? step.valueRef : ''),
    [
      'sandbox://credentials/email',
      'sandbox://credentials/password',
      'sandbox://settings/value',
    ],
  )
})

test('retains the separately bound replay task during resumable migration', () => {
  const task = buildSandboxProtectedSaveTask({
    ...base,
    taskId: 'task-sandbox-save-1',
    approvalToken: 'second-signed-token',
  })

  assert.equal(task.taskId, 'task-sandbox-save-1')
  assert.equal(task.approvalToken, 'second-signed-token')
  assert.notEqual(task.taskId, base.taskId)
  assert.notEqual(task.approvalToken, base.approvalToken)
  assert.equal(task.mode, 'prepare_change')
  assert.equal(task.metadata?.phase, 'approved-save-legacy-replay')
  assert.equal(task.steps.some(step => step.kind === 'checkpoint'), false)
  assert.equal(task.steps.some(step => step.kind === 'click' && step.selector === '[data-action="protected-save"]'), true)
  assert.equal(task.steps.some(step => step.kind === 'wait_for' && step.selector === '[data-browser-sandbox="save-success"]'), true)
  assert.equal(task.steps.at(-1)?.kind, 'screenshot')
})

test('rejects non-http sandbox URLs for both phases', () => {
  assert.throws(
    () => buildSandboxBrowserTask({ ...base, baseUrl: 'file:///tmp/sandbox.html' }),
    /Unsupported sandbox protocol/,
  )
  assert.throws(
    () => buildSandboxProtectedSaveTask({ ...base, baseUrl: 'file:///tmp/sandbox.html' }),
    /Unsupported sandbox protocol/,
  )
})
