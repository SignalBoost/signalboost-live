import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldStopUnhealthyRunpod } from '../lib/ai/cos/runpodOrphanGuard.ts'

test('stops a stale running pod when the reasoner is unhealthy', () => {
  assert.equal(shouldStopUnhealthyRunpod({ running: true, uptimeSeconds: 600, healthy: false, graceSeconds: 300 }), true)
})

test('does not stop during the cold-start grace period', () => {
  assert.equal(shouldStopUnhealthyRunpod({ running: true, uptimeSeconds: 120, healthy: false, graceSeconds: 300 }), false)
})

test('does not stop a healthy or already-stopped pod', () => {
  assert.equal(shouldStopUnhealthyRunpod({ running: true, uptimeSeconds: 600, healthy: true, graceSeconds: 300 }), false)
  assert.equal(shouldStopUnhealthyRunpod({ running: false, uptimeSeconds: 600, healthy: false, graceSeconds: 300 }), false)
})
