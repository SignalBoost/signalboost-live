import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('browser ingress sends owner build failures to authenticated Builder before public isolation', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const access = route.indexOf('const access = await getAccess()')
  const guard = route.indexOf('isPastedOperationalLog(prompt) && access?.isOwner', access)
  const builderRequest = route.indexOf("new URL('/api/builder', req.url)", guard)
  const builderCall = route.indexOf('builderPost(builderRequest)', builderRequest)
  const publicBoundary = route.indexOf('const response = await withPublicAuditIdentity', builderCall)
  assert.ok(access >= 0)
  assert.ok(guard > access)
  assert.ok(builderRequest > guard)
  assert.ok(builderCall > builderRequest)
  assert.ok(publicBoundary > builderCall)
})

test('ordinary public operational logs still receive deterministic analysis rather than repository authority', () => {
  const legacy = readFileSync(new URL('../app/api/concierge/route.ts', import.meta.url), 'utf8')
  const guard = legacy.indexOf('isPastedOperationalLog(objective)')
  const builder = legacy.indexOf('isConciergeBuilderObjective(objective)', guard)
  assert.ok(guard >= 0)
  assert.ok(builder > guard)
  assert.match(legacy, /concierge-operational-log-analysis/)
  assert.match(legacy.slice(guard, builder), /execution_allowed: false/)
})
