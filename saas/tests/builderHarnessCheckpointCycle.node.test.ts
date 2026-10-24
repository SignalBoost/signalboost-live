import assert from 'node:assert/strict'
import test from 'node:test'
import { runBuilderV2JobCycle, type BuilderV2LeaseStore } from '../lib/builder/agent-v2-job-cycle.ts'
import type { BuilderV2Agent, BuilderV2Checkpoint, BuilderV2Outcome } from '../lib/builder/agent-v2.ts'

const objective = 'Build a Node.js application. Verification commands: npm test, node index.js'
const initial: BuilderV2Checkpoint = { version: 2, workspaceId: 'w', objectiveDigest: 'obj',
  workspaceDigest: 'work', steps: [], revision: 0, verifiedRevision: -1, unproductive: 0, lastReceipt: '' }

function runCase(outcome: BuilderV2Outcome, prior: BuilderV2Checkpoint | null = initial) {
  const saved: BuilderV2Checkpoint[] = []
  const store: BuilderV2LeaseStore = {
    load: async () => ({ workspaceId: 'w', objective, claimGeneration: 1, checkpoint: prior }),
    save: async (_jobId, _claimGeneration, checkpoint) => { saved.push(checkpoint); return true },
  }
  const agent = { run: async () => outcome } as unknown as BuilderV2Agent
  return { saved, execute: () => runBuilderV2JobCycle({ jobId: 'j', claimGeneration: 1, store, agent }) }
}

test('harness replays LibraryFlow: a slice deadline saves edits and pauses the real job-cycle', async () => {
  const checkpoint: BuilderV2Checkpoint = { ...initial, revision: 1, steps: [
    {tool: 'edit_file', changed: true, ok: true, output: {path: 'src/reports.js'}} as never,
  ] }
  const {saved,execute} = runCase({ok:false,reason:'builder_v2_model_unavailable',
    summary:'harness_provider_cost_budget_exceeded',steps:checkpoint.steps,checkpoint})
  const result = await execute()
  assert.equal(result.status,'paused')
  assert.equal(saved.length,1)
  assert.equal(saved[0].revision,1)
})

test('harness does not endlessly resume ordinary provider outages with no progress', async () => {
  const {execute} = runCase({ok:false,reason:'builder_v2_model_unavailable',
    summary:'provider_unavailable',steps:[],checkpoint:initial})
  assert.equal((await execute()).status,'failed')
})

test('harness fails closed on missing checkpoint', async () => {
  const {execute} = runCase({ok:false,reason:'builder_v2_model_unavailable',
    summary:'harness_provider_cost_budget_exceeded',steps:[]})
  assert.equal((await execute()).status,'failed')
})

test('harness rejects stale claims before invoking the agent', async () => {
  let invoked = false
  const store: BuilderV2LeaseStore = {load:async()=>({
    workspaceId:'w',objective,claimGeneration:2,checkpoint:initial}),save:async()=>true}
  const agent = {run:async()=>{invoked=true;throw Error('unexpected')}} as unknown as BuilderV2Agent
  const result=await runBuilderV2JobCycle({jobId:'j',claimGeneration:1,store,agent})
  assert.equal(result.status,'lost_lease')
  assert.equal(invoked,false)
})
