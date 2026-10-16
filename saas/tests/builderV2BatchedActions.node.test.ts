// saas/tests/builderV2BatchedActions.node.test.ts
// Bolt/v0/Lovable-style generation for Builder V2: several actions per model reply, complete actions kept from a
// cut-off reply, and host verification of the required commands without spending model calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { BuilderV2Agent } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderRunnerPort } from '../lib/builder/contracts.ts'

/** Executes the real command against the real workspace files, like the sandbox runner. */
const localRunner: BuilderRunnerPort = {
  async run({ command, files }) {
    const dir = mkdtempSync(join(tmpdir(), 'builder-v2-batch-'))
    try {
      for (const file of files) {
        mkdirSync(dirname(join(dir, file.path)), { recursive: true })
        writeFileSync(join(dir, file.path), file.content)
      }
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'))
      const result = spawnSync('sh', ['-c', command], { cwd: dir, encoding: 'utf8', timeout: 60_000, env })
      return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr, timedOut: false }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
}

const objective = [
  '# MiniFlow',
  'Build a complete, working **MiniFlow** application using Node.js.',
  'Create all 4 files:',
  '```text',
  'miniflow/',
  '├── package.json',
  '├── index.js',
  '├── src',
  '│   └── cart.js',
  '└── test',
  '    └── cart.test.js',
  '```',
  'Implement at least **2 meaningful automated tests**.',
  '## Mandatory verification',
  'Execute all three commands:',
  '```bash',
  'npm test',
  'node --test test/*.test.js',
  'node index.js',
  '```',
].join('\n')

const files = {
  'package.json': '{"name":"miniflow","version":"1.0.0","scripts":{"test":"node --test test/*.test.js"}}\n',
  'src/cart.js': 'function total(items) {\n  return items.reduce((sum, item) => sum + item.price, 0)\n}\nmodule.exports = { total }\n',
  'test/cart.test.js': "const test = require('node:test')\nconst assert = require('node:assert')\nconst { total } = require('../src/cart.js')\ntest('total multiplies quantity', () => assert.equal(total([{ price: 2, qty: 3 }]), 6))\ntest('empty cart is zero', () => assert.equal(total([]), 0))\n",
  'index.js': "const { total } = require('./src/cart.js')\nconsole.log('Order total:', total([{ price: 5, qty: 2 }]))\n",
}
const write = (path: keyof typeof files) => ({ tool: 'write_file', path, content: files[path] })
const tools = (...actions: unknown[]) => JSON.stringify({ type: 'tools', actions })

test('a whole project is written in two replies and the host runs the required commands without model calls', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const prompts: string[] = []
  const replies = [
    tools(write('package.json'), write('src/cart.js')),
    tools(write('test/cart.test.js'), write('index.js')),
    // The host already ran the commands and returned the real failure: one repair edit.
    JSON.stringify({ type: 'tool', action: { tool: 'edit_file', path: 'src/cart.js', search: 'sum + item.price, 0', replace: 'sum + item.price * item.qty, 0' } }),
  ]
  let at = 0
  const agent = new BuilderV2Agent({ async generate(request) { prompts.push(String(request.prompt)); return replies[at++] ?? null } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace)
  const outcome = await agent.run({ workspaceId: 'mini', objective, maxSteps: 10 })

  assert.equal(outcome.ok, true, outcome.reason)
  assert.equal(prompts.length, 3, 'three model calls: two batched writes and one repair')
  // The host ran the required command after the last file, the model saw that real failure, then all three passed.
  assert.match(prompts[2], /builder_tests_failed|AssertionError/)
  const runs = outcome.steps.filter(step => step.tool === 'run_tests')
  assert.deepEqual(runs.map(step => step.ok), [false, true, true, true])
  assert.match(String((runs.at(-1)!.output as { stdout: string }).stdout), /Order total: 10/)
})

test('a reply cut off by the token limit still runs every complete action before the cut', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const full = tools(write('package.json'), write('src/cart.js'), write('index.js'))
  const cut = full.slice(0, full.indexOf('"index.js"') + 30)
  let at = 0
  const agent = new BuilderV2Agent({ async generate() { return [cut][at++] ?? null } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace)
  const outcome = await agent.run({ workspaceId: 'cut', objective, maxSteps: 2 })
  assert.deepEqual(outcome.steps.map(step => [step.tool, step.ok, step.changed]),
    [['write_file', true, true], ['write_file', true, true]])
  assert.equal(await workspace.readFile('cut', 'index.js'), null)
})

test('a batch stops at its first failed action', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const replies = [tools(
    { tool: 'edit_file', path: 'missing.js', search: 'a', replace: 'b' },
    write('package.json'),
  )]
  let at = 0
  const agent = new BuilderV2Agent({ async generate() { return replies[at++] ?? null } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace)
  const outcome = await agent.run({ workspaceId: 'stop', objective, maxSteps: 2 })
  assert.deepEqual(outcome.steps.map(step => [step.tool, step.ok]), [['edit_file', false]])
  assert.equal(await workspace.readFile('stop', 'package.json'), null)
})

test('a model timeout after every file exists still verifies on the host (#4601 behaviour)', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  for (const [path, content] of Object.entries(files)) await workspace.writeFile('to', path, content.replace('item.price, 0', 'item.price * item.qty, 0'))
  const agent = new BuilderV2Agent({ async generate() { throw new Error('builder_turn_timeout') } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace)
  const outcome = await agent.run({ workspaceId: 'to', objective, maxSteps: 3 })
  assert.equal(outcome.ok, true, outcome.reason)
  assert.equal(outcome.steps.filter(step => step.tool === 'run_tests' && step.ok).length, 3)
})

test('every model call carries a live todo list computed from host receipts', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const prompts: string[] = []
  const replies = [tools(write('package.json'), write('src/cart.js'))]
  let at = 0
  const agent = new BuilderV2Agent({ async generate(request) { prompts.push(String(request.prompt)); return replies[at++] ?? null } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace)
  await agent.run({ workspaceId: 'todo', objective, maxSteps: 2 })
  const first = JSON.parse(prompts[0]).todo
  const second = JSON.parse(prompts[1]).todo
  assert.deepEqual(first.writeFiles, ['package.json', 'index.js', 'src/cart.js', 'test/cart.test.js'])
  assert.deepEqual(second.writeFiles, ['index.js', 'test/cart.test.js'])
  assert.deepEqual(second.passCommands, ['npm test', 'node --test test/*.test.js', 'node index.js'])
  assert.deepEqual(second.tests, { passed: 0, required: 2 })
})
