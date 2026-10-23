import test from 'node:test'
import assert from 'node:assert/strict'
import { isOwnerRepairWithoutSource, signalBoostDeployedRepairTarget } from '../lib/builder/repository-repair-target.ts'

const input = (objective: string, isOwner: boolean) => ({
  objective, isOwner, hasAttachedSource: false, hasRepositoryImport: false,
  workspaceHasFiles: false, hasProjectContext: false,
})

test('owner can route a bare Builder admission error to platform repair', () => {
  const objective = 'builder_objective_not_coding'
  assert.equal(isOwnerRepairWithoutSource(input(objective, true)), true)
  const target = signalBoostDeployedRepairTarget(objective, {
    commitSha: 'a'.repeat(40), branch: 'main',
  }, { ownerRepairWithoutSource: true })
  assert.equal(target?.repository, 'SignalBoost/signalboost-live')
})

test('ordinary users and unrelated requests cannot turn into platform repair', () => {
  assert.equal(isOwnerRepairWithoutSource(input('builder_objective_not_coding', false)), false)
  assert.equal(isOwnerRepairWithoutSource(input('What is the weather?', true)), false)
  assert.equal(isOwnerRepairWithoutSource({ ...input('builder_objective_not_coding', true), workspaceHasFiles: true }), false)
  assert.equal(isOwnerRepairWithoutSource(input('builder_objective_required', true)), false)
})
