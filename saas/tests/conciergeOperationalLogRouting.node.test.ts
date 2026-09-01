import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('browser ingress keeps passive pasted build logs non-executing', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const explicitRepair = route.indexOf('isExplicitOperationalLogRepairRequest(prompt)')
  const passiveGuard = route.indexOf('isPastedOperationalLog(prompt)', explicitRepair)
  assert.ok(explicitRepair >= 0)
  assert.ok(passiveGuard > explicitRepair)
  assert.match(route.slice(passiveGuard), /concierge-operational-log-analysis/)
  assert.match(route.slice(passiveGuard), /execution_allowed: false/)
})

test('explicit failed SignalBoost log repair may reach only the owner-only pinned repository lane', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const explicitRepair = route.indexOf('isExplicitOperationalLogRepairRequest(prompt)')
  const parse = route.indexOf('parseSignalBoostRepositoryRepairTarget(prompt)', explicitRepair)
  const owner = route.indexOf('access?.isOwner', parse)
  const execute = route.indexOf('executeSignalBoostRepositoryRepair({', owner)
  const publicScope = route.indexOf('withPublicDeliveryScope', execute)
  assert.ok(explicitRepair >= 0)
  assert.ok(parse > explicitRepair)
  assert.ok(owner > parse)
  assert.ok(execute > owner)
  assert.ok(publicScope > execute)
  assert.match(route.slice(execute, publicScope), /crypto\.randomUUID\(\)/)
  assert.match(route.slice(execute, publicScope), /rawObjective: prompt/)
})

test('source-attached explicit log repairs still hand off to the ordinary Concierge Builder lane', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(route, /isExplicitOperationalLogRepairRequest\(prompt\) && !hasSourceAttachment/)
  assert.match(route, /isConciergeBuilderObjective\(prompt, routingContext\) \? legacyConciergePost\(req\) : cosPrimaryPost\(req\)/)
})

test('legacy Concierge passive-log guard remains before its ordinary Builder tool loop', () => {
  const legacy = readFileSync(new URL('../app/api/concierge/route.ts', import.meta.url), 'utf8')
  const guard = legacy.indexOf('isPastedOperationalLog(objective)')
  const builder = legacy.indexOf('isConciergeBuilderObjective(objective', guard)
  assert.ok(guard >= 0)
  assert.ok(builder > guard)
  assert.match(legacy, /concierge-operational-log-analysis/)
  assert.match(legacy.slice(guard, builder), /execution_allowed: false/)
})
