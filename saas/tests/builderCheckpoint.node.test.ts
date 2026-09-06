import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const action = (toolId: string, input: Record<string, unknown>) => JSON.stringify({ type: 'tool', toolId, input })
const objective = 'Fix the existing add.js function: it must add both numbers. Preserve the regression test. Run:\nnode --test add.test.js'

for (const pauseAfterFailure of [false, true]) test(`existing-file repair executes real fail/change/pass${pauseAfterFailure ? ' across a saved checkpoint' : ''}`, async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('repair', 'add.js', 'module.exports = (a, b) => a - b;')
  await workspace.writeFile('repair', 'add.test.js', "const test = require('node:test'); const assert = require('node:assert/strict'); test('adds both numbers', () => assert.equal(require('./add.js')(2, 3), 5));")
  const dir = await mkdtemp(join(tmpdir(), 'builder-existing-repair-'))
  const commands: string[] = []
  let pause = false
  const runner = { async run(input: { command: string; files: readonly { path: string; content: string }[] }) {
    commands.push(input.command)
    for (const file of input.files) await writeFile(join(dir, file.path), file.content)
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT
    const result = spawnSync(process.execPath, ['--test', 'add.test.js'], { cwd: dir, env, encoding: 'utf8', timeout: 10_000 })
    assert.equal(result.error, undefined); assert.equal(result.signal, null)
    if (pauseAfterFailure && commands.length === 1) pause = true
    return { exitCode: result.status!, stdout: result.stdout, stderr: result.stderr, timedOut: false }
  } }
  const actions = [action('read_file', { path: 'add.js' }), action('run', { command: 'node --test add.test.js' }),
    action('edit_file', { path: 'add.js', search: 'a - b', replace: 'a + b' }), action('run', { command: 'node --test add.test.js' })]
  const ai = { async generate() { assert.ok(actions.length); return actions.shift()! } }
  try {
    let result = await new BuilderToolLoop(ai, workspace, runner).run({ objective, workspaceId: 'repair', shouldPause: () => pause })
    if (pauseAfterFailure) {
      assert.equal(result.ok, false)
      if (result.ok) assert.fail('expected checkpoint')
      assert.equal(result.error, 'builder_job_paused')
      assert.ok(result.checkpoint)
      assert.deepEqual(commands, ['node --test add.test.js'])
      // A new controller instance receives only the serialized saved record and workspace.
      const checkpoint = JSON.parse(JSON.stringify(result.checkpoint))
      result = await new BuilderToolLoop(ai, workspace, runner).run({ objective, workspaceId: 'repair', checkpoint })
    }
    assert.equal(result.ok, true, JSON.stringify(result))
    const runs = result.trace.filter(item => item.toolId === 'run')
    assert.deepEqual(runs.map(item => item.ok), [false, true])
    assert.deepEqual(commands, ['node --test add.test.js', 'node --test add.test.js'])
    assert.equal(result.trace.filter(item => item.toolId === 'edit_file' && item.ok).length, 1)
    assert.match((runs[0].output as { stdout: string }).stdout, /(?:#|ℹ) fail 1/)
    assert.match((runs[1].output as { stdout: string }).stdout, /(?:#|ℹ) pass 1/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('checkpoint rejects changed scope and changed files without model or execution', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('scope', 'existing.js', 'console.log(1)')
  const blocked = { async generate(): Promise<string> { assert.fail('no model call') } }
  const runner = { async run(): Promise<never> { assert.fail('no execution') } }
  const initial = await new BuilderToolLoop(blocked, workspace, runner).run({ objective, workspaceId: 'scope', shouldPause: () => true })
  if (initial.ok || !initial.checkpoint) assert.fail('expected checkpoint')
  for (const input of [{ objective: 'Different task', workspaceId: 'scope' }, { objective, workspaceId: 'other' }]) {
    const result = await new BuilderToolLoop(blocked, workspace, runner).run({ ...input, checkpoint: initial.checkpoint })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error, 'builder_checkpoint_scope_mismatch')
  }
  await workspace.writeFile('scope', 'unexpected.js', '// changed outside the paused job')
  const result = await new BuilderToolLoop(blocked, workspace, runner).run({ objective, workspaceId: 'scope', checkpoint: initial.checkpoint })
  if (result.ok) assert.fail('changed workspace accepted')
  assert.equal(result.error, 'builder_checkpoint_workspace_changed')
})

test('creation resumes with original file classification and does not rerun a completed proof', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const objective = 'Create:\n- first.js\n- second.js\nRun:\nnode first.js\nnode second.js'
  let pause = false
  const commands: string[] = []
  const runner = { async run(input: { command: string }) {
    commands.push(input.command); pause = true
    return { exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false }
  } }
  const actions = ['first.js', 'second.js'].map(path => action('write_file', { path, content: 'console.log("ok")' }))
  const first = await new BuilderToolLoop({ async generate() { return actions.shift()! } }, workspace, runner)
    .run({ objective, workspaceId: 'create', shouldPause: () => pause })
  if (first.ok || !first.checkpoint) assert.fail('expected incomplete saved job')
  assert.deepEqual(commands, ['node first.js'])
  assert.deepEqual(first.checkpoint.initialPaths, [])
  const resumed = await new BuilderToolLoop({ async generate(): Promise<string> { assert.fail('proof scheduling needs no new generation') } }, workspace, runner)
    .run({ objective, workspaceId: 'create', checkpoint: JSON.parse(JSON.stringify(first.checkpoint)) })
  assert.equal(resumed.ok, true, JSON.stringify(resumed))
  assert.deepEqual(commands, ['node first.js', 'node second.js'])
})

test('continuation retains cumulative round limits and refuses repeated writes', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let calls = 0
  const write = action('write_file', { path: 'first.js', content: '// incomplete task' })
  const runner = { async run(): Promise<never> { assert.fail('no command') } }
  const first = await new BuilderToolLoop({ async generate() { calls++; return write } }, workspace, runner)
    .run({ objective: 'Create first.js and verify it.', workspaceId: 'budget', maxRounds: 2, shouldPause: () => calls > 1 })
  if (first.ok || !first.checkpoint) assert.fail('expected checkpoint')
  assert.equal(first.checkpoint.writeCount, 1)
  const resumed = await new BuilderToolLoop({ async generate() { return write } }, workspace, runner)
    .run({ objective: 'Create first.js and verify it.', workspaceId: 'budget', maxRounds: 2, checkpoint: first.checkpoint })
  assert.equal(resumed.ok, false)
  assert.equal(resumed.trace.filter(item => item.toolId === 'write_file' && item.ok).length, 1)
  assert.ok(resumed.trace.some(item => item.error?.startsWith('builder_repeated_tool_call:')))
})

test('scheduler accepts only its secret and resumes only server-owned paused jobs', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  const route = read('../app/api/cron/builder-continuations/route.ts')
  assert.match(route, /!secret \|\| request.headers.get\('authorization'\) !== `Bearer \$\{secret\}`/)
  assert.ok(route.indexOf('status: 401') < route.indexOf('await listBuilderContinuations'))
  assert.doesNotMatch(route, /request\.json|searchParams|enqueueBuilderJob/)
  const store = read('../lib/builder/job-store.ts')
  assert.match(store, /\.eq\('status', 'paused'\)/)
  assert.match(store, /\.lt\('claim_generation', 4\)/)
  assert.match(store, /p_generation: input.claimGeneration/)
  assert.doesNotMatch(store.match(/const JOB_SELECT = .*/)?.[0] || '', /checkpoint/)
  const config = JSON.parse(read('../vercel.json'))
  assert.equal(config.crons.find((cron: { path: string }) => cron.path === '/api/cron/builder-continuations').schedule, '* * * * *')
})

test('an overdue model response is checkpointed before its proposed tool executes', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const result = await new BuilderToolLoop({ async generate() {
    return action('write_file', { path: 'late.js', content: '// must not execute yet' })
  } }, workspace, { async run(): Promise<never> { assert.fail('no command') } })
    .run({ objective: 'Create late.js.', workspaceId: 'late', shouldPause: beforeTool => beforeTool === true })
  if (result.ok || !result.checkpoint) assert.fail('expected checkpoint')
  assert.equal(result.trace.length, 0)
  assert.equal((await workspace.listFiles('late')).length, 0)
})
