import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { builderVerificationOrder, pendingBuilderVerificationOrder, isVerificationProtectedPath } from '../lib/builder/verification-order.ts'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderToolTrace } from '../lib/builder/contracts.ts'

const objective = 'Extend add.js. Add focused assertions, run node --test add.test.js before changing add.js, then implement the behavior. Run:\nnode --test add.test.js'
const action = (toolId: string, input: Record<string, unknown>) => JSON.stringify({ type: 'tool', toolId, input })
const mutation = (path: string): BuilderToolTrace => ({ round: 1, toolId: 'edit_file', input: { path }, ok: true })
const run = (exitCode: number, timedOut = false): BuilderToolTrace => ({ round: 2, toolId: 'run', input: { command: 'node --test add.test.js' }, ok: exitCode === 0, output: { exitCode, timedOut } })

test('explicit test-before-edit contract excludes ordinary requests, negation, source blocks and traversal', () => {
  assert.deepEqual(builderVerificationOrder(objective), [{ command: 'node --test add.test.js', path: 'add.js', afterTestChange: true }])
  assert.deepEqual(builderVerificationOrder('Run `npm test` before editing `money.js`.'), [{ command: 'npm test', path: 'money.js', afterTestChange: false }])
  for (const path of ['add.js', '/add.js', '/workspace/add.js', 'workspace\\add.js']) assert.equal(isVerificationProtectedPath(path, builderVerificationOrder(objective)), true)
  for (const request of ['Create add.js and run it', 'Do not run npm test before editing money.js',
    '```text\nrun npm test before changing money.js\n```', 'run npm test before changing ../money.js']) assert.deepEqual(builderVerificationOrder(request), [])
})

test('old baseline, timeout and changed tests cannot satisfy verification order; a real failure can', () => {
  const contract = builderVerificationOrder(objective)
  for (const trace of [[], [run(0)], [run(0), mutation('add.test.js')], [mutation('add.test.js'), run(1, true)],
    [mutation('add.test.js'), run(0), mutation('add.test.js')]]) assert.equal(pendingBuilderVerificationOrder(contract, trace).length, 1)
  assert.equal(pendingBuilderVerificationOrder(contract, [mutation('add.test.js'), run(1)]).length, 0)
  assert.equal(pendingBuilderVerificationOrder(contract, [mutation('add.test.js'), run(0)]).length, 0)
})

for (const normalized of [false, true]) for (const resume of [false, true]) test(`${normalized ? 'normalized npm command: ' : ''}early source edit is blocked before storage; real new-test failure permits repair${resume ? ' across checkpoint' : ''}`, async () => {
  const command = normalized ? 'npm test' : 'node --test add.test.js'
  const request = objective.replaceAll('node --test add.test.js', command)
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('p', 'add.js', 'module.exports = (a, b) => a - b;')
  await workspace.writeFile('p', 'add.test.js', "const test = require('node:test'); const assert = require('node:assert/strict'); test('baseline', () => assert.equal(require('./add')(1,0),1));")
  const dir = await mkdtemp(join(tmpdir(), 'builder-order-'))
  const observed: number[] = []
  let paused = false
  let firstAttempt = true
  const actions = [action('run', { command }),
    action('edit_file', { path: 'add.test.js', search: "test('baseline'", replace: "test('both operands', () => assert.equal(require('./add')(2,3),5)); test('baseline'" }),
    action('edit_file', { path: 'add.js', search: 'a - b', replace: 'a + b' }),
    action('run', { command }),
    action('edit_file', { path: 'add.js', search: 'a - b', replace: 'a + b' }),
    action('run', { command })]
  const ai = { async generate(input: { prompt: string }) {
    if (firstAttempt && input.prompt.includes('builder_verification_order_required')) {
      assert.equal((await workspace.readFile('p', 'add.js'))?.content, 'module.exports = (a, b) => a - b;')
      firstAttempt = false
      if (resume) paused = true
    }
    return actions.shift() || JSON.stringify({ type: 'answer', answer: 'Done' })
  } }
  const runner = { async run(input: { files: readonly { path: string; content: string }[] }) {
    for (const file of input.files) await writeFile(join(dir, file.path), file.content)
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT
    const result = spawnSync(process.execPath, ['--test', 'add.test.js'], { cwd: dir, env, encoding: 'utf8', timeout: 10_000 })
    assert.equal(result.error, undefined); assert.equal(result.signal, null)
    observed.push(result.status!)
    return { exitCode: result.status!, stdout: result.stdout, stderr: result.stderr, timedOut: false }
  } }
  try {
    let result = await new BuilderToolLoop(ai, workspace, runner).run({ workspaceId: 'p', objective: request, projectContext: { objective: 'existing' }, shouldPause: () => paused })
    if (resume) {
      assert.equal(result.ok, false)
      if (result.ok || !result.checkpoint) assert.fail('checkpoint required')
      // The generated action was not executed when the slice paused; request the proving run again.
      actions.unshift(action('run', { command }))
      paused = false
      result = await new BuilderToolLoop(ai, workspace, runner).run({ workspaceId: 'p', objective: request, projectContext: { objective: 'existing' }, checkpoint: JSON.parse(JSON.stringify(result.checkpoint)) })
    }
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.deepEqual(observed, [0, 1, 0])
    if (normalized) assert.ok(result.trace.some(item => item.toolId === 'run' && item.input.requestedCommand === 'npm test' && item.input.command !== 'npm test'))
    assert.equal(result.trace.filter(item => item.error === 'builder_verification_order_required').length, 1)
    assert.equal(result.trace.filter(item => item.ok && item.toolId === 'edit_file' && item.input.path === 'add.js').length, 1)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
