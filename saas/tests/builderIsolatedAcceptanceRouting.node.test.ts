import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isConciergeBuilderObjective } from '../lib/ai/cos/cosReasoningRolePolicy.ts'
import { isExplicitIsolatedProjectBuild, parseSignalBoostRepositoryRepairTarget, signalBoostDeployedRepairTarget } from '../lib/builder/repository-repair-target.ts'
import { isNewBuilderProjectObjective, selectBuilderProject } from '../lib/builder/project-continuity.ts'
import { builderExecutionAdmissionBlocker } from '../lib/builder/execution-admission.ts'

const objective = readFileSync(new URL('./fixtures/builder-isolated-acceptance.txt', import.meta.url), 'utf8')

test('the actual failed acceptance request is executable isolated project work', () => {
  assert.equal(isConciergeBuilderObjective(objective), true)
  assert.equal(isExplicitIsolatedProjectBuild(objective), true)
  assert.equal(isNewBuilderProjectObjective(objective), true)
  assert.equal(parseSignalBoostRepositoryRepairTarget(objective), null)
  assert.equal(signalBoostDeployedRepairTarget(objective, {
    commitSha: '982a515c782658685369c92403c481f7b5998329', branch: 'main',
  }, { ownerPlatformEngineeringSubmission: true, ownerRepairWithoutSource: true }), null)
})

test('an isolated fixture never inherits the selected production workspace or conversation job', async () => {
  let lookups = 0
  const selected = await selectBuilderProject({
    objective, userId: '11111111-1111-4111-8111-111111111111',
    conversationId: '22222222-2222-4222-8222-222222222222',
    requestedWorkspaceId: '33333333-3333-4333-8333-333333333333',
    hasNewSource: false, repositoryImport: false,
  }, async () => { lookups++; throw new Error('must not borrow history') })
  assert.deepEqual(selected, {})
  assert.equal(lookups, 0)
})

test('runtime qualifiers do not change isolated scope; platform feature requests retain their scope', () => {
  for (const prompt of [
    'Create an isolated Python repository with a deliberately failing test. Commit it and open a PR.',
    'Build a new isolated workspace for a Node.js application.',
    'Create an isolated Node.js repository. Repair sum.js, open a PR and deploy a preview.',
  ]) assert.equal(isExplicitIsolatedProjectBuild(prompt), true, prompt)
  for (const prompt of [
    'Fix the Builder platform so it can create an isolated Node.js repository. Open a PR.',
    'Explain how to create an isolated Node.js repository.',
    'Implement Builder cancellation and open a PR in SignalBoost/signalboost-live.',
  ]) assert.equal(isExplicitIsolatedProjectBuild(prompt), false, prompt)
})

test('a full external acceptance request remains blocked until publication is supported; valid caps are admitted', () => {
  const blocker = builderExecutionAdmissionBlocker(objective)
  assert.equal(blocker?.error, 'builder_isolated_publication_unavailable')
  assert.equal(blocker?.status, 'incomplete')
  assert.equal(blocker?.execution_allowed, false)
  assert.match(blocker!.reply, /no job was started/)
  for (const limit of [
    'Limits: maximum $0.25 inference cost.',
    'Keep this job under 1 USD.',
    'Budget: at most 2 dollars.',
  ]) assert.equal(builderExecutionAdmissionBlocker(limit), null, limit)
  for (const prompt of [
    'Create an isolated Node.js repository with sum.js and sum.test.js.',
    'Build an expense tracker that displays a $50 budget.',
    'Explain why the previous inference cost was $0.50.',
  ]) assert.equal(builderExecutionAdmissionBlocker(prompt), null, prompt)
})
