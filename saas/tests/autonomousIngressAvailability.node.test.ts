import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const proxy = readFileSync(new URL('../proxyBase.ts', import.meta.url), 'utf8')

test('autonomous ingress keeps the kill switch fail-closed but tolerates only bounded transient control-plane failure', () => {
  assert.match(proxy, /AUTONOMY_STATUS_FRESH_MS = 10_000/)
  assert.match(proxy, /AUTONOMY_STATUS_TRANSIENT_GRACE_MS = 30_000/)
  assert.match(proxy, /AUTONOMY_STATUS_READ_TIMEOUT_MS = 2_000/)
  assert.match(proxy, /response\.status === 408 \|\| response\.status === 429 \|\| response\.status >= 500/)
  assert.match(proxy, /status\.transient[\s\S]*autonomyStatusCache[\s\S]*AUTONOMY_STATUS_TRANSIENT_GRACE_MS/)
  assert.match(proxy, /return false\s*\n\s*}\)\(\)/)
})

test('explicit disabled state is authoritative and non-transient failures never use stale allow', () => {
  assert.match(proxy, /if \(enabled === false\) return \{ state: 'disabled', transient: false \}/)
  assert.match(proxy, /if \(status\.state !== 'unavailable'\)[\s\S]*autonomyStatusCache = \{ enabled, checkedAt \}/)
  assert.match(proxy, /if \(!url \|\| !key\) return \{ state: 'unavailable', transient: false \}/)
  assert.match(proxy, /Cold starts, missing config\/row, RLS\/auth failures, and expired cache still fail closed/)
})
