import test from 'node:test'
import assert from 'node:assert/strict'
import { BuilderV2Agent, validateBuilderV2ReceiptHistory } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { runBuilderV2JobCycle, type BuilderV2LeaseStore } from '../lib/builder/agent-v2-job-cycle.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderV2Checkpoint } from '../lib/builder/agent-v2.ts'

test('durable job: failing host verification persists, resumes, repairs, and passes', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let claim = 1
  let saved: BuilderV2Checkpoint | null = null
  let modelCalls = 0
  let hostRuns = 0
  let saves = 0
  const store: BuilderV2LeaseStore = {
    async load() { return { workspaceId: 'w', objective: 'Build storage', claimGeneration: claim, checkpoint: saved } },
    async save(_id, generation, checkpoint) {
      if (generation !== claim) return false
      // JSON round trip models the persisted Supabase JSONB checkpoint at every continuation.
      saved = JSON.parse(JSON.stringify(checkpoint)) as BuilderV2Checkpoint
      assert.equal(validateBuilderV2ReceiptHistory(saved), true, 'saved receipt history must be valid')
      saves++
      return true
    },
  }
  const decisions = [
    { type: 'tool', action: { tool: 'write_file', path: 'src/storage.js', content: 'module.exports = { value: 0 }' } },
    { type: 'tool', action: { tool: 'run_tests', command: 'node --test' } },
    { type: 'tool', action: { tool: 'edit_file', path: 'src/storage.js', search: 'value: 0', replace: 'value: 1' } },
    { type: 'tool', action: { tool: 'run_tests', command: 'node --test' } },
    { type: 'finish', summary: 'verified' },
  ]
  const ai = { async generate() { return JSON.stringify(decisions[modelCalls++]) } }
  const runner = { async run() {
    hostRuns++
    const content = (await workspace.readFile('w', 'src/storage.js'))?.content ?? ''
    const ok = content.includes('value: 1')
    return { exitCode: ok ? 0 : 1, stdout: ok ? '# tests 1\n# pass 1\n# fail 0' : '# tests 1\n# pass 0\n# fail 1', stderr: '', timedOut: false }
  } }
  const agent = new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, runner), workspace)
  const first = await runBuilderV2JobCycle({ jobId: 'j', claimGeneration: claim, store, agent, maxSteps: 2 })
  assert.equal(first.status, 'paused', first.reason)
  assert.ok(saved)
  assert.equal(saved!.verifiedRevision, -1)
  assert.equal(saved!.steps.filter(step => step.tool === 'run_tests').length, 1)
  claim++
  const second = await runBuilderV2JobCycle({ jobId: 'j', claimGeneration: claim, store, agent, maxSteps: 4 })
  assert.equal(second.status, 'verified', second.reason)
  assert.equal(hostRuns, 2)
  assert.ok(saves >= 2)
  assert.match((await workspace.readFile('w', 'src/storage.js'))?.content ?? '', /value: 1/)
})
