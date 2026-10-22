import test from 'node:test'
import assert from 'node:assert/strict'
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
