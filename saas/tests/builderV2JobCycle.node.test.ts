import test from 'node:test'
import assert from 'node:assert/strict'
import { BuilderV2Agent } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { runBuilderV2JobCycle, type BuilderV2LeaseStore } from '../lib/builder/agent-v2-job-cycle.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderV2Checkpoint } from '../lib/builder/agent-v2.ts'

test('V2 durable job persists checkpoint, resumes and verifies exactly once', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let generation = 1
  let saved: BuilderV2Checkpoint | null = null
  let saves = 0
  const store: BuilderV2LeaseStore = {
    async load() { return { workspaceId: 'w', objective: 'Build storage', claimGeneration: generation, checkpoint: saved } },
    async save(_id, claim, checkpoint) {
      if (claim !== generation) return false
      saved = checkpoint; saves++; return true
    },
  }
  let n = 0
  let executed = 0
  const decisions = [
    { type: 'tool', action: { tool: 'write_file', path: 'src/storage.js', content: 'export default {}' } },
    { type: 'tool', action: { tool: 'run_tests', command: 'node --test' } },
    { type: 'finish', summary: 'verified' },
  ]
  const ai = { async generate() { return JSON.stringify(decisions[n++]) } }
  const runner = { async run() {
    executed++
    return { exitCode: 0, stdout: 'pass', stderr: '', timedOut: false }
  } }
  const agent = new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, runner), workspace)
  const first = await runBuilderV2JobCycle({ jobId: 'j', claimGeneration: generation, store, agent, maxSteps: 1 })
  assert.equal(first.status, 'paused')
  assert.equal(saved?.steps.length, 1)
  generation++
  const second = await runBuilderV2JobCycle({ jobId: 'j', claimGeneration: generation, store, agent, maxSteps: 3 })
  assert.equal(second.status, 'verified')
  assert.equal(executed, 1)
  assert.equal(saves, 2)
})

test('V2 stale generation cannot claim or persist newer work', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const store: BuilderV2LeaseStore = {
    async load() { return { workspaceId: 'w', objective: 'Build app', claimGeneration: 2, checkpoint: null } },
    async save() { throw new Error('should not save') },
  }
  const agent = new BuilderV2Agent({ async generate() { throw Error('should not generate') } },
    new BuilderV2Dispatcher(workspace, { async run() { throw Error('should not run') } }), workspace)
  const stale = await runBuilderV2JobCycle({ jobId: 'j', claimGeneration: 1, store, agent })
  assert.equal(stale.status, 'lost_lease')
})

test('Codex review on #4628: a resumed slice with no new receipt does not re-save a key-reordered checkpoint', async () => {
  const { InMemoryBuilderWorkspace: Ws } = await import('../lib/builder/workspace.ts')
  const workspace = new Ws()
  await workspace.writeFile('w', 'a.js', 'module.exports = 1\n')
  // A checkpoint as it comes back from jsonb: same content, keys in a different order.
  const first = await new BuilderV2Agent({ async generate() { return null } }, new BuilderV2Dispatcher(workspace, { async run() { throw Error('no run') } }), workspace)
    .run({ workspaceId: 'w', objective: 'Fix a.js', maxSteps: 1 })
  const fresh = first.checkpoint!
  const reordered = Object.fromEntries(Object.entries(fresh).reverse()) as typeof fresh
  const saved: unknown[] = []
  const store: BuilderV2LeaseStore = {
    async load() { return { workspaceId: 'w', objective: 'Fix a.js', claimGeneration: 2, checkpoint: reordered } },
    async save(_job, _generation, checkpoint) { saved.push(checkpoint); return true },
  }
  const agent = new BuilderV2Agent({ async generate() { throw new Error('builder_turn_timeout') } },
    new BuilderV2Dispatcher(workspace, { async run() { throw Error('no run') } }), workspace)
  const cycle = await runBuilderV2JobCycle({ jobId: 'j', claimGeneration: 2, store, agent, maxSteps: 4 })
  assert.equal(cycle.status, 'paused')
  // Since #4688 the checkpoint carries the whole-job model-call budget, and a timed-out call counts, so this slice
  // saves exactly once — for that increment. Everything else is byte-identical to the reordered checkpoint: the
  // key order alone did not cause the save.
  assert.equal(saved.length, 1)
  const { modelCalls: before, ...restBefore } = reordered as Record<string, unknown>
  const { modelCalls: after, ...restAfter } = saved[0] as Record<string, unknown>
  assert.equal(after, (before as number) + 1)
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(restAfter).sort())), JSON.stringify(Object.fromEntries(Object.entries(restBefore).sort())))
})
