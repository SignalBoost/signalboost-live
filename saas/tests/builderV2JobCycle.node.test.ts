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
