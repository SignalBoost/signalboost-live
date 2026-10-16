// saas/tests/builderV2SliceProgress.node.test.ts
// Production 2026-10-16: the OrderFlow acceptance spec on Builder V2 ended with builder_v2_no_progress.
import test from 'node:test'
import assert from 'node:assert/strict'
import { BuilderV2Agent, BUILDER_V2_STALL_LIMIT, type BuilderV2Checkpoint } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { runBuilderV2JobCycle, type BuilderV2LeaseStore } from '../lib/builder/agent-v2-job-cycle.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderRunnerPort } from '../lib/builder/contracts.ts'

const tool = (action: Record<string, unknown>) => JSON.stringify({ type: 'tool', action })
const finish = JSON.stringify({ type: 'finish', summary: 'done' })
const scripted = (replies: string[]) => {
  let at = 0
  return { calls: () => at, ai: { async generate() { return replies[at++] ?? null } } }
}
const passing: BuilderRunnerPort = { async run() { return { exitCode: 0, stdout: '# pass 1\n# fail 0', stderr: '', timedOut: false } } }

test('a resumed job gets a fresh slice budget instead of pausing forever once it holds maxSteps receipts', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const objective = 'Create index.js and run npm test.'
  const first = scripted(Array.from({ length: 24 }, (_, i) => tool({ tool: 'write_file', path: `src/f${i}.js`, content: `module.exports = ${i}\n` })))
  const sliceOne = await new BuilderV2Agent(first.ai, new BuilderV2Dispatcher(workspace, passing), workspace)
    .run({ workspaceId: 'w', objective, maxSteps: 24 })
  assert.equal(sliceOne.reason, 'builder_v2_step_budget')
  assert.equal(sliceOne.checkpoint?.steps.length, 24)

  const second = scripted([
    tool({ tool: 'write_file', path: 'index.js', content: 'module.exports = 1\n' }),
    tool({ tool: 'run_tests', command: 'npm test' }),
    finish,
  ])
  const sliceTwo = await new BuilderV2Agent(second.ai, new BuilderV2Dispatcher(workspace, passing), workspace)
    .run({ workspaceId: 'w', objective, maxSteps: 24, checkpoint: sliceOne.checkpoint })
  assert.equal(second.calls(), 3)
  assert.equal(sliceTwo.ok, true, sliceTwo.reason)
})

test('ordinary debugging (failed run, reads, a missed edit) is not a stall', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let runs = 0
  const runner: BuilderRunnerPort = { async run() {
    runs++
    return runs === 1
      ? { exitCode: 1, stdout: '# pass 0\n# fail 1', stderr: 'AssertionError', timedOut: false }
      : { exitCode: 0, stdout: '# pass 1\n# fail 0', stderr: '', timedOut: false }
  } }
  const replies = scripted([
    tool({ tool: 'write_file', path: 'src/a.js', content: 'module.exports = () => 1\n' }),
    tool({ tool: 'write_file', path: 'test/a.test.js', content: 'test\n' }),
    tool({ tool: 'run_tests', command: 'npm test' }),
    tool({ tool: 'read_file', path: 'src/a.js' }),
    tool({ tool: 'read_file', path: 'test/a.test.js' }),
    tool({ tool: 'list_files' }),
    tool({ tool: 'search_files', query: 'module.exports' }),
    tool({ tool: 'edit_file', path: 'src/a.js', search: 'does not exist', replace: 'x' }),
    tool({ tool: 'read_file', path: 'missing.js' }),
    tool({ tool: 'run_tests', command: 'node --test' }),
    tool({ tool: 'edit_file', path: 'src/a.js', search: '() => 1', replace: '() => 2' }),
    tool({ tool: 'run_tests', command: 'npm test' }),
    finish,
  ])
  const outcome = await new BuilderV2Agent(replies.ai, new BuilderV2Dispatcher(workspace, runner), workspace)
    .run({ workspaceId: 'd', objective: 'Create src/a.js and run npm test.', maxSteps: 30 })
  assert.equal(outcome.ok, true, outcome.reason)
})

test('an identical action with no change since is answered from its receipt, then pauses the slice', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('r', 'a.js', 'one\n')
  const prompts: string[] = []
  const read = tool({ tool: 'read_file', path: 'a.js' })
  const agent = new BuilderV2Agent({ async generate(request) { prompts.push(String(request.prompt)); return read } },
    new BuilderV2Dispatcher(workspace, passing), workspace)
  const outcome = await agent.run({ workspaceId: 'r', objective: 'Fix a.js', maxSteps: 30 })
  assert.equal(outcome.reason, 'builder_v2_step_budget')
  assert.ok(outcome.checkpoint)
  assert.equal(outcome.steps.length, 1, 'the repeated read was not executed again')
  assert.match(prompts[2], /builder_v2_repeated_action/)
  assert.match(prompts[2], /one\\n/)
})

test('a long run with no change and no passing command pauses the slice with its checkpoint', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const failing: BuilderRunnerPort = { async run() { return { exitCode: 1, stdout: '', stderr: 'boom', timedOut: false } } }
  const agent = new BuilderV2Agent({ async generate() { return tool({ tool: 'run_tests', command: 'npm test' }) } },
    new BuilderV2Dispatcher(workspace, failing), workspace)
  const outcome = await agent.run({ workspaceId: 's', objective: 'Run npm test.', maxSteps: 60 })
  assert.equal(outcome.reason, 'builder_v2_step_budget')
  assert.equal(outcome.steps.length, BUILDER_V2_STALL_LIMIT)
  assert.equal(outcome.checkpoint?.unproductive, BUILDER_V2_STALL_LIMIT)
})

test('a file the model has read can be rewritten; an unseen one cannot be overwritten', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('o', 'src/cart.js', 'old\n')
  await workspace.writeFile('o', 'src/other.js', 'keep\n')
  const replies = scripted([
    tool({ tool: 'write_file', path: 'src/other.js', content: 'blind\n' }),
    tool({ tool: 'read_file', path: 'src/cart.js' }),
    tool({ tool: 'write_file', path: 'src/cart.js', content: 'new\n' }),
  ])
  const outcome = await new BuilderV2Agent(replies.ai, new BuilderV2Dispatcher(workspace, passing), workspace)
    .run({ workspaceId: 'o', objective: 'Rewrite src/cart.js', maxSteps: 3 })
  assert.deepEqual(outcome.steps.map(step => [step.tool, step.ok, step.changed]),
    [['write_file', false, false], ['read_file', true, false], ['write_file', true, true]])
  assert.equal((await workspace.readFile('o', 'src/other.js'))!.content, 'keep\n')
  assert.equal((await workspace.readFile('o', 'src/cart.js'))!.content, 'new\n')
})

test('one unparseable reply is feedback; the build continues', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const replies = scripted([
    'Sure! I will create the file now.',
    tool({ tool: 'write_file', path: 'index.js', content: 'module.exports = 1\n' }),
    tool({ tool: 'run_tests', command: 'npm test' }),
    finish,
  ])
  const outcome = await new BuilderV2Agent(replies.ai, new BuilderV2Dispatcher(workspace, passing), workspace)
    .run({ workspaceId: 'p', objective: 'Create index.js and run npm test.', maxSteps: 10 })
  assert.equal(outcome.ok, true, outcome.reason)
})

test('a model timeout pauses the job with its checkpoint instead of failing it', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let saved: BuilderV2Checkpoint | null = null
  const store: BuilderV2LeaseStore = {
    async load() { return { workspaceId: 't', objective: 'Create index.js', claimGeneration: 1, checkpoint: saved } },
    async save(_id, _claim, checkpoint) { saved = checkpoint; return true },
  }
  let call = 0
  const ai = { async generate() {
    if (call++ === 0) return tool({ tool: 'write_file', path: 'index.js', content: 'module.exports = 1\n' })
    throw new Error('builder_model_deadline_exceeded')
  } }
  const cycle = await runBuilderV2JobCycle({ jobId: 'j', claimGeneration: 1, store,
    agent: new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, passing), workspace), maxSteps: 24 })
  assert.equal(cycle.status, 'paused')
  assert.equal(cycle.reason, 'builder_v2_model_unavailable')
  assert.equal(saved?.steps.length, 1)
})

test('long builds checkpoint compact receipts that still validate on resume', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const objective = 'Create the files and run npm test.'
  const big = 'x'.repeat(5_000)
  const first = scripted([
    ...Array.from({ length: 12 }, (_, i) => tool({ tool: 'write_file', path: `src/f${i}.js`, content: `${big}${i}\n` })),
    ...Array.from({ length: 12 }, (_, i) => tool({ tool: 'read_file', path: `src/f${i}.js` })),
  ])
  const sliceOne = await new BuilderV2Agent(first.ai, new BuilderV2Dispatcher(workspace, passing), workspace)
    .run({ workspaceId: 'c', objective, maxSteps: 24 })
  const checkpoint = sliceOne.checkpoint!
  assert.ok(JSON.stringify(checkpoint).length < 120_000, 'old read outputs are not carried forward')
  const second = scripted([tool({ tool: 'run_tests', command: 'npm test' }), finish])
  const sliceTwo = await new BuilderV2Agent(second.ai, new BuilderV2Dispatcher(workspace, passing), workspace)
    .run({ workspaceId: 'c', objective, maxSteps: 5, checkpoint })
  assert.equal(sliceTwo.ok, true, sliceTwo.reason)
})

test('production 2026-10-16: a model refused before any step fails at once instead of spending every slice', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let saves = 0
  let generation = 0
  const prior: BuilderV2Checkpoint | null = null
  const store: BuilderV2LeaseStore = {
    async load() { return { workspaceId: 'busy', objective: 'Create index.js', claimGeneration: generation, checkpoint: prior } },
    async save() { saves++; return true },
  }
  const agent = new BuilderV2Agent({ async generate() { throw new Error('builder_runpod_primary_busy') } },
    new BuilderV2Dispatcher(workspace, passing), workspace)
  generation = 1
  const cycle = await runBuilderV2JobCycle({ jobId: 'j', claimGeneration: 1, store, agent, maxSteps: 24 })
  assert.equal(cycle.status, 'failed')
  assert.equal(cycle.reason, 'builder_v2_model_unavailable: builder_runpod_primary_busy')
  assert.equal(saves, 0)
})

test('a V2 job a person started keeps the model while they chat; only self-healing work yields', async () => {
  const { readFileSync } = await import('node:fs')
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  const v2 = runner.slice(runner.indexOf("job.metadata.builderEngine === 'v2'"), runner.indexOf('runBuilderV2JobCycle({'))
  assert.match(v2, /createBuilderCodingAiPort\(\{ yieldToChat: selfHealingCapacityJob\(job\) \}\)/)
  assert.doesNotMatch(runner, /yieldToChat: true/)
})

test('Codex review on #4595: a read-only slice followed by a model failure is not progress', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('ro', 'a.js', 'one\n')
  let saves = 0
  const store: BuilderV2LeaseStore = {
    async load() { return { workspaceId: 'ro', objective: 'Fix a.js', claimGeneration: 1, checkpoint: null } },
    async save() { saves++; return true },
  }
  let call = 0
  const ai = { async generate() {
    if (call++ === 0) return tool({ tool: 'read_file', path: 'a.js' })
    throw new Error('builder_runpod_primary_busy')
  } }
  const cycle = await runBuilderV2JobCycle({ jobId: 'j', claimGeneration: 1, store,
    agent: new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, passing), workspace), maxSteps: 24 })
  assert.equal(cycle.status, 'failed')
  assert.equal(cycle.reason, 'builder_v2_model_unavailable: builder_runpod_primary_busy')
})

test('Codex review on #4597: rerunning an already-passing command before a model failure is not progress', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const objective = 'Create index.js and run npm test.'
  const first = scripted([
    tool({ tool: 'write_file', path: 'index.js', content: 'module.exports = 1\n' }),
    tool({ tool: 'run_tests', command: 'npm test' }),
  ])
  const sliceOne = await new BuilderV2Agent(first.ai, new BuilderV2Dispatcher(workspace, passing), workspace)
    .run({ workspaceId: 'rr', objective, maxSteps: 2 })
  assert.equal(sliceOne.checkpoint?.verifiedRevision, 1)
  let saved: BuilderV2Checkpoint | null = sliceOne.checkpoint!
  const store: BuilderV2LeaseStore = {
    async load() { return { workspaceId: 'rr', objective, claimGeneration: 2, checkpoint: saved } },
    async save(_id, _claim, checkpoint) { saved = checkpoint; return true },
  }
  let call = 0
  const ai = { async generate() {
    if (call++ === 0) return tool({ tool: 'run_tests', command: 'npm test' })
    throw new Error('builder_model_deadline_exceeded')
  } }
  const cycle = await runBuilderV2JobCycle({ jobId: 'j', claimGeneration: 2, store,
    agent: new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, passing), workspace), maxSteps: 24 })
  assert.equal(cycle.status, 'failed')
  assert.equal(cycle.reason, 'builder_v2_model_unavailable: builder_model_deadline_exceeded')
})

test('Codex review on #4598: a newly passing required command before a model failure is progress', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const objective = 'Create index.js.\n## Mandatory verification\nExecute all two commands:\n```bash\nnpm test\nnode index.js\n```'
  const first = scripted([
    tool({ tool: 'write_file', path: 'index.js', content: 'module.exports = 1\n' }),
    tool({ tool: 'run_tests', command: 'npm test' }),
  ])
  const sliceOne = await new BuilderV2Agent(first.ai, new BuilderV2Dispatcher(workspace, passing), workspace)
    .run({ workspaceId: 'nc', objective, maxSteps: 2 })
  let saved: BuilderV2Checkpoint | null = sliceOne.checkpoint!
  const store: BuilderV2LeaseStore = {
    async load() { return { workspaceId: 'nc', objective, claimGeneration: 2, checkpoint: saved } },
    async save(_id, _claim, checkpoint) { saved = checkpoint; return true },
  }
  let call = 0
  const ai = { async generate() {
    if (call++ === 0) return tool({ tool: 'run_tests', command: 'node index.js' })
    throw new Error('builder_model_deadline_exceeded')
  } }
  const cycle = await runBuilderV2JobCycle({ jobId: 'j', claimGeneration: 2, store,
    agent: new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, passing), workspace), maxSteps: 24 })
  assert.equal(cycle.status, 'paused')
  assert.equal(saved?.steps.length, 3)
})

test('Codex review on #4599: an ad-hoc passing command is not progress toward required commands', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const objective = 'Create index.js.\n## Mandatory verification\nExecute all two commands:\n```bash\nnpm test\nnode index.js\n```'
  const first = scripted([
    tool({ tool: 'write_file', path: 'index.js', content: 'module.exports = 1\n' }),
    tool({ tool: 'run_tests', command: 'npm test' }),
  ])
  const sliceOne = await new BuilderV2Agent(first.ai, new BuilderV2Dispatcher(workspace, passing), workspace)
    .run({ workspaceId: 'ah', objective, maxSteps: 2 })
  let saved: BuilderV2Checkpoint | null = sliceOne.checkpoint!
  const store: BuilderV2LeaseStore = {
    async load() { return { workspaceId: 'ah', objective, claimGeneration: 2, checkpoint: saved } },
    async save(_id, _claim, checkpoint) { saved = checkpoint; return true },
  }
  let call = 0
  const ai = { async generate() {
    if (call++ === 0) return tool({ tool: 'run_tests', command: 'node -e "1"' })
    throw new Error('builder_model_deadline_exceeded')
  } }
  const cycle = await runBuilderV2JobCycle({ jobId: 'j', claimGeneration: 2, store,
    agent: new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, passing), workspace), maxSteps: 24 })
  assert.equal(cycle.status, 'failed')
})
