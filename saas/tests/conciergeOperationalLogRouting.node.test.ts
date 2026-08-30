import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('browser ingress sends owner build failures to authenticated Builder before public isolation', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const auditIdentity = route.indexOf('const auditUserId = (await getAccess()')
  const ownerLookup = route.indexOf('const ownerRepairAccess = isPastedOperationalLog(prompt)', auditIdentity)
  const guard = route.indexOf('if (ownerRepairAccess?.isOwner)', ownerLookup)
  const builderRequest = route.indexOf("new URL('/api/builder', req.url)", guard)
  const builderCall = route.indexOf('builderPost(builderRequest)', builderRequest)
  const publicBoundary = route.indexOf('const response = await withPublicAuditIdentity', builderCall)
  assert.ok(auditIdentity >= 0)
  assert.ok(ownerLookup > auditIdentity)
  assert.ok(guard > ownerLookup)
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
