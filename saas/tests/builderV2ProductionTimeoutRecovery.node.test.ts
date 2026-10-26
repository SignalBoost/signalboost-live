import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runBuilderV2JobCycle } from '../lib/builder/agent-v2-job-cycle.ts'
import type { BuilderV2Checkpoint } from '../lib/builder/agent-v2.ts'
import type { BuilderV2Agent } from '../lib/builder/agent-v2.ts'

const checkpoint: BuilderV2Checkpoint = {
  version: 2, workspaceId: 'workspace', objectiveDigest: 'objective', workspaceDigest: 'workspace',
  steps: [{ tool: 'write_file', ok: true, changed: true }], revision: 1,
  verifiedRevision: -1, unproductive: 0, lastReceipt: 'write_file',
}

test('real inference timeout after durable file edit retains progress and pauses, not fails', async () => {
  let saves = 0
  const store = {
    async load() { return { workspaceId: 'workspace', objective: 'Fix the application', claimGeneration: 1, checkpoint: null } },
    async save(_id: string, _generation: number, value: BuilderV2Checkpoint) {
      assert.equal(value.revision, 1)
      saves++
      return true
    },
  }
  const agent = {
    async run(input: { onCheckpoint: (checkpoint: BuilderV2Checkpoint) => Promise<void> }) {
      await input.onCheckpoint(checkpoint)
      throw Error('builder_turn_timeout')
    },
  } as unknown as BuilderV2Agent
  const result = await runBuilderV2JobCycle({ jobId: 'job', claimGeneration: 1, store, agent })
  assert.equal(result.status, 'paused')
  assert.equal(result.result?.checkpoint?.revision, 1)
  assert.equal(result.result?.steps.length, 1)
  assert.equal(saves, 1)
})

test('non-transient failure keeps saved receipts but remains terminal', async () => {
  const store = {
    async load() { return { workspaceId: 'workspace', objective: 'Fix the application', claimGeneration: 1, checkpoint } },
    async save() { throw Error('unexpected save') },
  }
  const agent = { async run() { throw Error('builder_security_denied') } } as unknown as BuilderV2Agent
  const result = await runBuilderV2JobCycle({ jobId: 'job', claimGeneration: 1, store, agent })
  assert.equal(result.status, 'failed')
  assert.equal(result.reason, 'builder_security_denied')
  assert.equal(result.result?.steps.length, 1)
})

// Production 2026-10-24 (LibraryFlow, workspace 557041fe): the owned GPU timed out, the slice spent its paid-fallback
// ceiling on a failing run and three reads, and the job ended at slice 9 of 24 after 13 of 60 minutes. Each slice has
// its own spend ceiling, so running out of it ends the slice, not the job; the idle-slice stop still bounds repeats.
test('the slice spend ceiling running out without progress pauses the job instead of ending it', async () => {
  const store = {
    async load() { return { workspaceId: 'workspace', objective: 'Fix the application', claimGeneration: 9, checkpoint } },
    async save() { return true },
  }
  const reads: BuilderV2Checkpoint = { ...checkpoint,
    steps: [...checkpoint.steps, { tool: 'run_tests', ok: false, changed: false }, { tool: 'read_file', ok: true, changed: false }] }
  const agent = { async run() {
    return { ok: false, reason: 'builder_v2_model_unavailable', summary: 'harness_provider_cost_budget_exceeded', steps: reads.steps, checkpoint: reads }
  } } as unknown as BuilderV2Agent
  const result = await runBuilderV2JobCycle({ jobId: 'job', claimGeneration: 9, store, agent })
  assert.equal(result.status, 'paused')
  assert.equal(result.result?.steps.length, 3)
})

test('a model outage without progress still ends the job', async () => {
  const store = {
    async load() { return { workspaceId: 'workspace', objective: 'Fix the application', claimGeneration: 2, checkpoint } },
    async save() { return true },
  }
  const agent = { async run() {
    return { ok: false, reason: 'builder_v2_model_unavailable', summary: 'builder coding AI provider returned no text', steps: checkpoint.steps, checkpoint }
  } } as unknown as BuilderV2Agent
  const result = await runBuilderV2JobCycle({ jobId: 'job', claimGeneration: 2, store, agent })
  assert.equal(result.status, 'failed')
})

for (const summary of ['inference_transport_deadline', 'timeout:inference_transport_deadline']) {
  test(`RunPod transport deadline ${summary} pauses an unchanged checkpoint instead of failing`, async () => {
    const store = {
      async load() { return { workspaceId: 'workspace', objective: 'Fix the application', claimGeneration: 3, checkpoint } },
      async save() { return true },
    }
    const agent = { async run() {
      return { ok: false, reason: 'builder_v2_model_unavailable', summary, steps: checkpoint.steps, checkpoint }
    } } as unknown as BuilderV2Agent
    const result = await runBuilderV2JobCycle({ jobId: 'job', claimGeneration: 3, store, agent })
    assert.equal(result.status, 'paused')
    assert.equal(result.result?.checkpoint?.revision, 1)
  })
}

test('standard Builder job checkpoints provider cost exhaustion rather than treating it as source failure', () => {
  const source = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  const guard = source.indexOf("message === 'harness_provider_cost_budget_exceeded' && job.checkpoint && builderMayContinue(job, job.checkpoint)")
  const pause = source.indexOf('await pauseBuilderJob({ job, checkpoint: job.checkpoint', guard)
  const terminal = source.indexOf('await terminalFailure(job,', guard)
  assert.ok(guard > 0 && pause > guard && terminal > pause)
  assert.match(source.slice(guard, terminal), /verification is still pending/)
})
