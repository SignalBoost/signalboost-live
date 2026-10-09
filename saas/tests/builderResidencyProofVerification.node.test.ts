import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { verifyBuilderResidencyProof } from '../platform-harness/residency/proof-verification.ts'
import { runHarnessWorker } from '../platform-harness/runtime/runner.ts'
import { routeHarnessOutcome } from '../platform-harness/core/failure-router.ts'

const ref = 'evidence://builder-residency/proof-fixture'

test('the shared Harness routes a killed independent verifier to infrastructure recovery, not teaching', async () => {
  const result = await runHarnessWorker({
    manifest: {
      runId: 'residency-proof-resource-test', objective: 'Verify an isolated practice result',
      identity: { agentId: 'resident', role: 'builder', tenantId: 'fixture' },
      profile: 'residency', environment: { environmentId: 'fixture', class: 'sandbox' },
      capabilities: [], authorityManifestRef: 'host://fixture',
      limits: { maxToolCalls: 0, deadlineMs: 10_000 }, learningFeedbackAllowed: true,
    },
    capabilities: { async resolve() { return { satisfied: true, resolved: {}, missing: [] } } },
    executor: { async execute() { throw new Error('no capabilities authorized') } },
    worker: { async run() {} },
    verifier: { async verify() { return verifyBuilderResidencyProof({ exitCode: 137, stdout: '', stderr: 'Killed', timedOut: false }, ref) } },
  })
  assert.equal(result.outcome.status, 'infrastructure_failure')
  assert.equal(result.outcome.failureCode, 'residency_proof_exit_137')
  assert.equal(routeHarnessOutcome(result.outcome.status), 'self_healing')
  assert.equal(result.authorityExpanded, false)
  assert.equal(result.productionMutationObserved, false)
})

test('an actual SIGKILL exit is an infrastructure fault, never a competency verdict', () => {
  const run = spawnSync('sh', ['-c', 'kill -KILL $$'], { encoding: 'utf8' })
  assert.equal(run.signal, 'SIGKILL')
  const verdict = verifyBuilderResidencyProof({ exitCode: 137, stdout: run.stdout, stderr: run.stderr, timedOut: false }, ref)
  assert.equal(verdict.verified, false)
  assert.equal(verdict.failureAttribution, 'infrastructure')
  assert.equal(verdict.reason, 'residency_proof_exit_137')
  assert.deepEqual(verdict.evidenceRefs, [ref])
})

test('an actual assertion failure remains a competency failure even with resource words in output', () => {
  const run = spawnSync(process.execPath, ['-e', "require('node:assert/strict').equal(1, 2, 'SIGKILL OOM memory')"], { encoding: 'utf8' })
  assert.equal(run.status, 1)
  const verdict = verifyBuilderResidencyProof({ exitCode: run.status!, stdout: run.stdout, stderr: run.stderr, timedOut: false }, ref)
  assert.equal(verdict.verified, false)
  assert.equal(verdict.failureAttribution, 'competency')
  assert.equal(verdict.reason, 'residency_proof_exit_1')
})

test('only a completed successful proof passes; timeouts never pass', () => {
  const proof = { exitCode: 0, stdout: 'ok', stderr: '', timedOut: false }
  const passed = verifyBuilderResidencyProof(proof, ref)
  assert.equal(passed.verified, true)
  assert.equal(passed.failureAttribution, undefined)
  const timedOut = verifyBuilderResidencyProof({ ...proof, timedOut: true }, ref)
  assert.equal(timedOut.verified, false)
  assert.equal(timedOut.reason, 'residency_proof_timed_out')
})
