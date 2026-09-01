import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('browser ingress never promotes a pasted build log into authenticated Builder execution', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(route, /const auditUserId = \(await getAccess\(\)/)
  assert.doesNotMatch(route, /ownerRepairAccess/)
  assert.doesNotMatch(route, /builderPost\(builderRequest\)/)
  assert.doesNotMatch(route, /new URL\('\/api\/builder'/)
  assert.doesNotMatch(route, /executeSignalBoostRepositoryRepair/)
})

test('public operational logs receive deterministic analysis rather than repository authority', () => {
  const legacy = readFileSync(new URL('../app/api/concierge/route.ts', import.meta.url), 'utf8')
  const guard = legacy.indexOf('isPastedOperationalLog(objective)')
  const builder = legacy.indexOf('isConciergeBuilderObjective(objective', guard)
  assert.ok(guard >= 0)
  assert.ok(builder > guard)
  assert.match(legacy, /concierge-operational-log-analysis/)
  assert.match(legacy.slice(guard, builder), /execution_allowed: false/)
})
