import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Builder gives owner build failures an executable repository-repair path before deterministic diagnosis', () => {
  const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  const guard = route.indexOf('isPastedOperationalLog(rawObjective)')
  const owner = route.indexOf('access.isOwner', guard)
  const repair = route.indexOf('executeSignalBoostRepositoryRepair', owner)
  const fallback = route.indexOf("source: 'builder-operational-log-analysis'", repair)
  const validation = route.indexOf('cleanObjective(rawObjective)', fallback)
  assert.ok(guard >= 0)
  assert.ok(owner > guard)
  assert.ok(repair > owner)
  assert.ok(fallback > repair)
  assert.ok(validation > fallback)
})

test('unrecognized or non-owner logs retain a non-executing diagnostic fallback', () => {
  const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  assert.match(route, /if \(repair\) \{/)
  assert.match(
    route,
    /await persistBuilderTurn\(\{ conversationId, userId: access\.userId, objective: rawObjective, reply, workspaceId, files \}\)/,
  )
  assert.match(route, /return NextResponse\.json\(repair\.payload, \{ status: repair\.status \}\)/)
  assert.match(route, /const reply = operationalLogReply\(rawObjective\)/)
  assert.match(route, /execution_allowed: false/)
})
