import test from 'node:test'
import assert from 'node:assert/strict'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

test('repeated file request is idempotent and verification executes', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let runs = 0
  const dispatcher = new BuilderV2Dispatcher(workspace, {
    async run() { runs++; return { exitCode: 0, stdout: 'pass', stderr: '', timedOut: false } },
  })
  const action = { tool: 'write_file' as const, path: 'src/storage.js', content: 'export default {}' }
  assert.equal((await dispatcher.dispatch('test', action)).changed, true)
  const repeated = await dispatcher.dispatch('test', action)
  assert.equal(repeated.ok, true)
  assert.equal(repeated.changed, false)
  assert.equal((await dispatcher.dispatch('test', { tool: 'run_tests', command: 'node --test' })).ok, true)
  assert.equal(runs, 1)
})

test('conflicting write preserves source and permits explicit repair', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const dispatcher = new BuilderV2Dispatcher(workspace, { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } })
  await dispatcher.dispatch('test', { tool: 'write_file', path: 'src/storage.js', content: 'before' })
  const conflict = await dispatcher.dispatch('test', { tool: 'write_file', path: 'src/storage.js', content: 'after' })
  assert.equal(conflict.error, 'builder_write_content_conflict')
  assert.equal((await workspace.readFile('test', 'src/storage.js'))?.content, 'before')
  const change = await dispatcher.dispatch('test', { tool: 'edit_file', path: 'src/storage.js', search: 'before', replace: 'after' })
  assert.equal(change.ok, true)
  assert.equal((await workspace.readFile('test', 'src/storage.js'))?.content, 'after')
})

test('host verification failure is preserved and can be repaired', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let count = 0
  const dispatcher = new BuilderV2Dispatcher(workspace, { async run({ files }) {
    count++
    const fixed = files.some(file => file.path === 'src/storage.js' && file.content === 'fixed')
    return { exitCode: fixed ? 0 : 1, stdout: '', stderr: fixed ? '' : 'Assertion failed', timedOut: false }
  } })
  await dispatcher.dispatch('test', { tool: 'write_file', path: 'src/storage.js', content: 'broken' })
  assert.equal((await dispatcher.dispatch('test', { tool: 'run_tests', command: 'node --test' })).error, 'builder_tests_failed')
  await dispatcher.dispatch('test', { tool: 'edit_file', path: 'src/storage.js', search: 'broken', replace: 'fixed' })
  assert.equal((await dispatcher.dispatch('test', { tool: 'run_tests', command: 'node --test' })).ok, true)
  assert.equal(count, 2)
})

test('V2 agent creates source, runs verification, and only then completes', async () => {
  const { BuilderV2Agent } = await import('../lib/builder/agent-v2.ts')
  const workspace = new InMemoryBuilderWorkspace()
  const actions = [
    { type: 'tool', action: { tool: 'write_file', path: 'src/storage.js', content: 'export default {}' } },
    { type: 'tool', action: { tool: 'write_file', path: 'src/storage.js', content: 'export default {}' } },
    { type: 'tool', action: { tool: 'run_tests', command: 'node --test' } },
    { type: 'finish', summary: 'Built and tested' },
  ]
  let index = 0
  let runs = 0
  const ai = { async generate() { return JSON.stringify(actions[Math.min(index++, actions.length - 1)]) } }
  const dispatcher = new BuilderV2Dispatcher(workspace, { async run() {
    runs++; return { exitCode: 0, stdout: 'pass', stderr: '', timedOut: false }
  } })
  const outcome = await new BuilderV2Agent(ai, dispatcher).run({ workspaceId: 'w', objective: 'Build storage', maxSteps: 12 })
  assert.equal(outcome.ok, true)
  assert.equal(runs, 1)
  assert.equal(outcome.steps.filter(x => x.tool === 'write_file').length, 2)
})

test('V2 agent does not accept unverified success from the model', async () => {
  const { BuilderV2Agent } = await import('../lib/builder/agent-v2.ts')
  const ai = { async generate() { return JSON.stringify({ type: 'finish', summary: 'All tests passed' }) } }
  const dispatcher = new BuilderV2Dispatcher(new InMemoryBuilderWorkspace(), { async run() {
    throw Error('should not run')
  } })
  const outcome = await new BuilderV2Agent(ai, dispatcher).run({ workspaceId: 'w', objective: 'Build an app' })
  assert.equal(outcome.ok, false)
  assert.equal(outcome.reason, 'builder_v2_unverified_completion')
})

test('V2 resumes from a verified workspace checkpoint without replaying source writes', async () => {
  const { BuilderV2Agent } = await import('../lib/builder/agent-v2.ts')
  const workspace = new InMemoryBuilderWorkspace()
  let tests = 0
  const runner = { async run() { tests++; return { exitCode: 0, stdout: 'pass', stderr: '', timedOut: false } } }
  const dispatcher = new BuilderV2Dispatcher(workspace, runner)
  const actions = [
    { type: 'tool', action: { tool: 'write_file', path: 'src/storage.js', content: 'saved' } },
    { type: 'tool', action: { tool: 'run_tests', command: 'node --test' } },
    { type: 'finish', summary: 'verified after resume' },
  ]
  let cursor = 0
  const ai = { async generate() { return JSON.stringify(actions[cursor++]) } }
  let checkpoint: import('../lib/builder/agent-v2.ts').BuilderV2Checkpoint | undefined
  const first = await new BuilderV2Agent(ai, dispatcher, workspace).run({
    workspaceId: 'w', objective: 'Implement storage', maxSteps: 2,
    onCheckpoint: async value => { checkpoint = value },
  })
  assert.equal(first.reason, 'builder_v2_step_budget')
  assert.ok(checkpoint)
  const resumed = await new BuilderV2Agent(ai, dispatcher, workspace).run({
    workspaceId: 'w', objective: 'Implement storage', maxSteps: 3, checkpoint,
  })
  assert.equal(resumed.ok, true)
  assert.equal(tests, 1)
  assert.equal(resumed.steps.length, 2)
})

test('V2 refuses to resume after workspace changed outside the agent', async () => {
  const { BuilderV2Agent } = await import('../lib/builder/agent-v2.ts')
  const workspace = new InMemoryBuilderWorkspace()
  const dispatcher = new BuilderV2Dispatcher(workspace, { async run() {
    return { exitCode: 0, stdout: '', stderr: '', timedOut: false }
  } })
  let checkpoint: import('../lib/builder/agent-v2.ts').BuilderV2Checkpoint | undefined
  const ai = { async generate() {
    return JSON.stringify({ type: 'tool', action: { tool: 'write_file', path: 'a.js', content: 'first' } })
  } }
  await new BuilderV2Agent(ai, dispatcher, workspace).run({
    workspaceId: 'w', objective: 'Build example', maxSteps: 1,
    onCheckpoint: async value => { checkpoint = value },
  })
  await workspace.writeFile('w', 'a.js', 'changed')
  const result = await new BuilderV2Agent(ai, dispatcher, workspace).run({
    workspaceId: 'w', objective: 'Build example', checkpoint,
  })
  assert.equal(result.reason, 'builder_v2_checkpoint_workspace_changed')
})

test('resumed V2 checkpoint rejects invented verification evidence', async () => {
  const { BuilderV2Agent } = await import('../lib/builder/agent-v2.ts')
  const { checkpointDigest, workspaceDigest } = await import('../lib/builder/checkpoint.ts')
  const workspace = new InMemoryBuilderWorkspace()
  const objective = 'Build verified software'
  const fake = {
    version: 2 as const, workspaceId: 'w', objectiveDigest: checkpointDigest(objective),
    workspaceDigest: await workspaceDigest(workspace, 'w'),
    steps: [], revision: 0, verifiedRevision: 0, unproductive: 0, lastReceipt: '',
  }
  const dispatcher = new BuilderV2Dispatcher(workspace, { async run() {
    throw Error('must not execute')
  } })
  const ai = { async generate() { return JSON.stringify({ type: 'finish', summary: 'passed' }) } }
  const result = await new BuilderV2Agent(ai, dispatcher, workspace).run({ workspaceId: 'w', objective, checkpoint: fake })
  assert.equal(result.reason, 'builder_v2_checkpoint_invalid')
})

test('resumed V2 checkpoint rejects success without a passing host exit code', async () => {
  const { BuilderV2Agent } = await import('../lib/builder/agent-v2.ts')
  const { checkpointDigest, workspaceDigest } = await import('../lib/builder/checkpoint.ts')
  const workspace = new InMemoryBuilderWorkspace()
  const objective = 'Build verified software'
  const forged = {
    version: 2 as const, workspaceId: 'w', objectiveDigest: checkpointDigest(objective),
    workspaceDigest: await workspaceDigest(workspace, 'w'),
    steps: [{ tool: 'run_tests' as const, ok: true, changed: false,
      output: { exitCode: 1, timedOut: false } }],
    revision: 0, verifiedRevision: 0, unproductive: 0, lastReceipt: '',
  }
  const dispatcher = new BuilderV2Dispatcher(workspace, { async run() {
    throw Error('must not execute')
  } })
  const ai = { async generate() { return JSON.stringify({ type: 'finish', summary: 'passed' }) } }
  const result = await new BuilderV2Agent(ai, dispatcher, workspace).run({ workspaceId: 'w', objective, checkpoint: forged })
  assert.equal(result.reason, 'builder_v2_checkpoint_invalid')
})

test('a refused edit tells the model where the search matched instead of a bare error', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const dispatcher = new BuilderV2Dispatcher(workspace, { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } })
  await workspace.writeFile('test', 'src/stock.js', 'function a() {\n  return count;\n}\nfunction b() {\n  return count;\n}\n')
  const ambiguous = await dispatcher.dispatch('test', { tool: 'edit_file', path: 'src/stock.js', search: '  return count;', replace: '  return count - 1;' })
  assert.equal(ambiguous.ok, false)
  assert.equal(ambiguous.error, 'builder_edit_target_ambiguous')
  assert.deepEqual(ambiguous.output, {
    path: 'src/stock.js', matches: 2,
    locations: [{ line: 2, text: '  return count;' }, { line: 5, text: '  return count;' }],
    hint: 'The search text occurs at each listed line. Include a neighbouring line in the search so it matches only the one you mean.',
  })
  assert.deepEqual(ambiguous.next, ['edit_file', 'read_file'])
  const missing = await dispatcher.dispatch('test', { tool: 'edit_file', path: 'src/stock.js', search: 'return count;\n  }', replace: 'x' })
  assert.equal(missing.error, 'builder_edit_target_not_found')
  assert.deepEqual((missing.output as { locations: unknown }).locations, [{ line: 2, text: '  return count;' }, { line: 5, text: '  return count;' }])
  // Widened with the function line, the edit lands once and the file changes.
  const landed = await dispatcher.dispatch('test', { tool: 'edit_file', path: 'src/stock.js', search: 'function b() {\n  return count;', replace: 'function b() {\n  return count - 1;' })
  assert.equal(landed.changed, true)
  assert.match((await workspace.readFile('test', 'src/stock.js'))!.content, /function b\(\) \{\n  return count - 1;/)
})
