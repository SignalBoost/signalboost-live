import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')

test('owner Developer workspace may enter pinned repository repair before passive log analysis', () => {
  const developer = route.indexOf('isDeveloperWorkspaceRequest(request)')
  const owner = route.indexOf('access.isOwner === true', developer)
  const parse = route.indexOf('parseSignalBoostRepositoryRepairTarget(objective)', owner)
  const execute = route.indexOf('executeSignalBoostRepositoryRepair({', parse)
  const passive = route.indexOf('isPastedOperationalLog(objective) && !debugPlan', execute)
  assert.ok(developer >= 0)
  assert.ok(owner > developer)
  assert.ok(parse > owner)
  assert.ok(execute > parse)
  assert.ok(passive > execute)
  assert.match(route, /builder_repository_target_required/)
  assert.match(route, /status: 400/)
})

test('ordinary pasted build logs remain analysis-only outside the direct owner repair lane', () => {
  const guard = route.indexOf('isPastedOperationalLog(objective) && !debugPlan')
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

test('direct route does not contain repository session implementation or bypass owner and exact-target gates', () => {
  assert.doesNotMatch(route, /VercelRepositoryRepairSession/)
  const developer = route.indexOf('isDeveloperWorkspaceRequest(request)')
  const owner = route.indexOf('access.isOwner === true', developer)
  const parse = route.indexOf('parseSignalBoostRepositoryRepairTarget(objective)', owner)
  const execute = route.indexOf('executeSignalBoostRepositoryRepair({', parse)
  assert.ok(owner > developer)
  assert.ok(parse > owner)
  assert.ok(execute > parse)
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
