import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const lifecycle = readFileSync(new URL('../lib/ai/cos/runpodLifecycle.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/cos-runpod-idle-stop/route.ts', import.meta.url), 'utf8')

test('idle-stop and orphan guard have independent flags', () => {
  assert.match(lifecycle, /export function runpodAutoStopEnabled\(\): boolean/)
  assert.match(lifecycle, /export function runpodOrphanGuardEnabled\(\): boolean/)
  assert.match(lifecycle, /COS_RUNPOD_AUTO_STOP_ENABLED/)
  assert.match(lifecycle, /COS_RUNPOD_ORPHAN_GUARD_ENABLED/)
})

test('orphan guard stop is gated by orphanGuardEnabled', () => {
  assert.match(route, /orphanGuardEnabled && shouldStopUnhealthyRunpod/)
})

test('idle stop gate runs after orphan guard', () => {
  const orphanIndex = route.indexOf('orphanedUnhealthyCompute: true')
  const idleGateIndex = route.indexOf('if (!autoStopEnabled)')
  assert.ok(orphanIndex > 0 && idleGateIndex > orphanIndex)
})

test('route only fully short-circuits when both checks are disabled', () => {
  assert.match(route, /if \(!autoStopEnabled && !orphanGuardEnabled\)/)
})
