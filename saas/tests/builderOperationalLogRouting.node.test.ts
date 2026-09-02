// saas/tests/builderOperationalLogRouting.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')

test('a pasted build log is admitted as a durable Builder job instead of a canned analysis', () => {
  // The Builder surface is a developer workspace: pasted failure evidence is the job, so it must
  // reach the tool loop. The old synchronous template reply must not come back.
  assert.doesNotMatch(route, /operationalLogReply/)
  assert.doesNotMatch(route, /builder-operational-log-analysis/)
  assert.match(route, /!debugPlan && !logEvidence && !isConciergeBuilderObjective\(objective, routingContext\)/)
  const admission = route.indexOf('!logEvidence && !isConciergeBuilderObjective(objective, routingContext)')
  const enqueue = route.indexOf('await enqueueBuilderJob({', admission)
  assert.ok(admission >= 0)
  assert.ok(enqueue > admission)
})

test('log-derived work is tagged as evidence carrying no repository authority', () => {
  assert.match(route, /const logEvidence = isOperationalLogEvidence\(objective\)/)
  assert.match(route, /const passiveLogEvidence = isPastedOperationalLog\(objective\)/)
  assert.match(route, /logEvidence: true/)
  assert.match(route, /repositoryAuthority: false/)
})

test('log-derived workspace jobs never acquire repository authority', () => {
  assert.doesNotMatch(route, /VercelRepositoryRepairSession/)
  // Repository scope exists only in the owner-gated Platform Engineer lane, which is pinned to the
  // deployed revision and returns before any log-derived workspace job is created.
  const owner = route.indexOf('if (!access.isOwner)')
  const execute = route.indexOf('enqueueSignalBoostRepositoryRepairJob({', owner)
  const schedule = route.indexOf('runBuilderJob(job.jobId, access.userId)', execute)
  const logEvidence = route.indexOf('const logEvidence = isOperationalLogEvidence(objective)', schedule)
  const enqueue = route.indexOf('await enqueueBuilderJob({', logEvidence)
  assert.ok(owner >= 0)
  assert.ok(execute > owner)
  assert.ok(schedule > execute)
  assert.ok(logEvidence > schedule)
  assert.ok(enqueue > logEvidence)
  assert.match(route, /await persistSynchronousReply\(\{ conversationId, userId: access\.userId, objective, reply \}\)/)
})

test('a log plus one attached source file still enters only the fixed debug protocol', () => {
  const files = route.indexOf('const files = cleanFiles(body?.files)')
  const plan = route.indexOf('const debugPlan = planDebugFileJob(objective, files)', files)
  const kind = route.indexOf("jobKind: debugPlan ? 'debug_file' : 'standard'", plan)
  assert.ok(files >= 0)
  assert.ok(plan > files)
  assert.ok(kind > plan)
  assert.match(route, /error: 'builder_debug_attachment_required'/)
})

test('non-coding, non-log objectives are still refused without creating a job', () => {
  const refusal = route.indexOf("error: 'builder_objective_not_coding'")
  const enqueue = route.indexOf('await enqueueBuilderJob({', refusal)
  assert.ok(refusal >= 0)
  assert.ok(enqueue > refusal)
  assert.match(route, /execution_allowed: false/)
  assert.match(route, /external_action_taken: false/)
})
