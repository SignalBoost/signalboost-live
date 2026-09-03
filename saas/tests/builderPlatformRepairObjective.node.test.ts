import assert from 'node:assert/strict'
import test from 'node:test'
import { signalBoostDeployedRepairTarget } from '../lib/builder/repository-repair-target.ts'

const deployment = {
  commitSha: '26f4486d502e8e6f0cebe62715c6f38479d4a555',
  branch: 'main',
}

const failedJobObjective = 'The Builder did not arrive at a clear success; it is either still running or finished without a verifiable result. Please inspect the Builder job status and final result, determine why it did not produce a clear completion, and fix the underlying platform issue so Builder reliably returns a verifiable success/failure outcome.'

test('routes the real failed Builder outcome request to the deployed Platform Engineer', () => {
  const target = signalBoostDeployedRepairTarget(failedJobObjective, deployment)
  assert.ok(target)
  assert.equal(target.trigger, 'deployed_platform_objective')
  assert.equal(target.repository, 'SignalBoost/signalboost-live')
  assert.equal(target.fullCommitSha, deployment.commitSha)
  assert.equal(target.projectRoot, 'saas')
})

test('keeps read-only Builder status questions out of repository repair', () => {
  assert.equal(
    signalBoostDeployedRepairTarget('Show me the Builder job status and final result.', deployment),
    null,
  )
})

test('keeps unrelated customer coding work out of SignalBoost repository repair', () => {
  assert.equal(
    signalBoostDeployedRepairTarget('Fix checkout validation in the attached customer project.', deployment),
    null,
  )
})

test('still rejects platform repair when the host cannot pin an immutable deployed commit', () => {
  assert.equal(
    signalBoostDeployedRepairTarget(failedJobObjective, { commitSha: 'not-a-commit', branch: 'main' }),
    null,
  )
})
