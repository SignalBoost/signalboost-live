import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')

test('pasted build logs are analyzed before any workspace or job execution', () => {
  const guard = route.indexOf('isPastedOperationalLog(objective)')
  const workspace = route.indexOf('createSupabaseBuilderWorkspace(access.userId)', guard)
  const enqueue = route.indexOf('await enqueueBuilderJob({', guard)
  assert.ok(guard >= 0)
  assert.ok(workspace > guard)
  assert.ok(enqueue > workspace)
  assert.match(route, /const reply = operationalLogReply\(objective\)/)
  assert.match(route, /source: 'builder-operational-log-analysis'/)
  assert.match(route, /execution_allowed: false/)
  assert.match(route, /external_action_taken: false/)
})

test('logs never invoke repository repair, sandbox execution, or an asynchronous job', () => {
  assert.doesNotMatch(route, /executeSignalBoostRepositoryRepair/)
  assert.doesNotMatch(route, /VercelRepositoryRepairSession/)
  const guard = route.indexOf('isPastedOperationalLog(objective)')
  const fallbackReturn = route.indexOf('execution_allowed: false', guard)
  const enqueue = route.indexOf('await enqueueBuilderJob({', fallbackReturn)
  assert.ok(fallbackReturn > guard)
  assert.ok(enqueue > fallbackReturn)
  assert.match(route, /await persistSynchronousReply\(\{ conversationId, userId: access\.userId, objective, reply \}\)/)
})

test('a log plus one attached source file may enter only the fixed debug protocol', () => {
  const files = route.indexOf('const files = cleanFiles(body?.files)')
  const plan = route.indexOf('const debugPlan = planDebugFileJob(objective, files)', files)
  const logGuard = route.indexOf('isPastedOperationalLog(objective) && !debugPlan', plan)
  assert.ok(files >= 0)
  assert.ok(plan > files)
  assert.ok(logGuard > plan)
  assert.match(route, /if \(!debugPlan && !isConciergeBuilderObjective\(objective, routingContext\)\)/)
})
