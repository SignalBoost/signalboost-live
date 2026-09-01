import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('browser ingress keeps passive pasted build logs non-executing', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const repair = route.indexOf('const explicitOperationalRepair =')
  const passiveGuard = route.indexOf('if (pastedOperationalLog && !hasSourceAttachment)', repair)
  assert.ok(repair >= 0)
  assert.ok(passiveGuard > repair)
  assert.match(route.slice(passiveGuard), /concierge-operational-log-analysis/)
  assert.match(route.slice(passiveGuard), /execution_allowed: false/)
})

test('standalone immediately preceding debug intent carries into the next pasted log turn', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(route, /hasExplicitOperationalLogRepairIntent/)
  assert.match(route, /const previousUser = userMessages\.at\(-2\)/)
  assert.match(route, /const previousUserPrompt = typeof previousUser\?\.content === 'string' \? previousUser\.content : ''/)
  assert.match(route, /isExplicitOperationalLogRepairRequest\(prompt\)[\s\S]{0,160}pastedOperationalLog && hasExplicitOperationalLogRepairIntent\(previousUserPrompt\)/)
  assert.doesNotMatch(route, /pastedOperationalLog && isExplicitOperationalLogRepairRequest\(previousUserPrompt\)/)
  const repair = route.indexOf('if (explicitOperationalRepair && !hasSourceAttachment)')
  const passive = route.indexOf('if (pastedOperationalLog && !hasSourceAttachment)', repair)
  assert.ok(repair >= 0 && passive > repair)
})

test('explicit failed SignalBoost log repair may reach only the owner-only pinned repository lane', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const explicitRepair = route.indexOf('if (explicitOperationalRepair && !hasSourceAttachment)')
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

test('source-attached log repairs still hand off to the ordinary Concierge Builder lane', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(route, /if \(explicitOperationalRepair && !hasSourceAttachment\)/)
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
