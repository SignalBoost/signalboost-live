// saas/tests/builderV2ModelRetry.node.test.ts
// Production 2026-10-17: one empty model reply ("builder coding AI provider returned no text") ended an OrderFlow job
// at slice 4 with every file written and a failing test to repair. Cline, Codex, Aider and SWE-agent all retry a
// failed model call in place; Builder V2 now retries 3 times (1s, 2s, 4s; Cline's schedule) before giving up the slice.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { BuilderV2Agent, BUILDER_V2_MODEL_RETRIES } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderRunnerPort } from '../lib/builder/contracts.ts'

const localRunner: BuilderRunnerPort = {
  async run({ command, files }) {
    const dir = mkdtempSync(join(tmpdir(), 'builder-v2-retry-'))
    try {
      for (const file of files) {
        mkdirSync(dirname(join(dir, file.path)), { recursive: true })
        writeFileSync(join(dir, file.path), file.content)
      }
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'))
      const result = spawnSync('sh', ['-c', command], { cwd: dir, encoding: 'utf8', timeout: 60_000, env })
      return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr, timedOut: false }
    } finally { rmSync(dir, { recursive: true, force: true }) }
  },
}

const objective = ['# MiniFlow', 'Build a complete, working **MiniFlow** application using Node.js.', 'Create all 4 files:', '```text',
  'miniflow/', '├── package.json', '├── index.js', '├── src', '│   └── cart.js', '└── test', '    └── cart.test.js', '```',
  'Implement at least **2 meaningful automated tests**.', '## Mandatory verification', 'Execute all three commands:', '```bash',
  'npm test', 'node --test test/*.test.js', 'node index.js', '```'].join('\n')
const files: Record<string, string> = {
  'package.json': '{"name":"miniflow","version":"1.0.0","scripts":{"test":"node --test test/*.test.js"}}\n',
  // The bug the model has to repair, as in the production job: every file exists and one test fails.
  'src/cart.js': 'function total(items) {\n  return items.reduce((sum, item) => sum + item.price, 0)\n}\nmodule.exports = { total }\n',
  'test/cart.test.js': "const test = require('node:test')\nconst assert = require('node:assert')\nconst { total } = require('../src/cart.js')\ntest('total multiplies quantity', () => assert.equal(total([{ price: 2, qty: 3 }]), 6))\ntest('empty cart is zero', () => assert.equal(total([]), 0))\n",
  'index.js': "const { total } = require('./src/cart.js')\nconsole.log('Order total:', total([{ price: 5, qty: 2 }]))\n",
}
const repair = JSON.stringify({ type: 'tool', action: { tool: 'edit_file', path: 'src/cart.js', search: 'sum + item.price, 0', replace: 'sum + item.price * item.qty, 0' } })
const noText = () => new Error('builder coding AI provider returned no text')

async function setup(id: string) {
  const workspace = new InMemoryBuilderWorkspace()
  for (const [path, content] of Object.entries(files)) await workspace.writeFile(id, path, content)
  return workspace
}

test('the production case: empty replies during repair are retried and the build verifies', async () => {
  const workspace = await setup('p')
  const replies: (string | Error)[] = [noText(), noText(), repair]
  const delays: number[] = []
  let calls = 0
  const agent = new BuilderV2Agent({ async generate() { calls++; const r = replies.shift(); if (r instanceof Error) throw r; return r ?? null } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace)
  const outcome = await agent.run({ workspaceId: 'p', objective, maxSteps: 4, retryDelay: async ms => { delays.push(ms) } })
  assert.equal(outcome.ok, true, outcome.reason)
  assert.equal(calls, 3)
  assert.deepEqual(delays, [1_000, 2_000])
  const runs = outcome.steps.filter(step => step.tool === 'run_tests')
  assert.deepEqual(runs.map(step => step.ok), [false, true, true, true])
})

test('a provider that stays down ends the slice after 3 retries with every receipt kept', async () => {
  const workspace = await setup('d')
  const delays: number[] = []
  let calls = 0
  const agent = new BuilderV2Agent({ async generate() { calls++; throw noText() } }, new BuilderV2Dispatcher(workspace, localRunner), workspace)
  const outcome = await agent.run({ workspaceId: 'd', objective, maxSteps: 4, retryDelay: async ms => { delays.push(ms) } })
  assert.equal(outcome.reason, 'builder_v2_model_unavailable')
  assert.equal(outcome.summary, 'builder coding AI provider returned no text')
  assert.equal(calls, 1 + BUILDER_V2_MODEL_RETRIES)
  assert.deepEqual(delays, [1_000, 2_000, 4_000])
  assert.ok(outcome.steps.some(step => step.tool === 'run_tests' && !step.ok), 'the failing host run is kept for the next slice')
})

test('never retried: the slice budget running out, a cut-off reply, a cancellation', async () => {
  for (const [name, error, abort] of [
    ['slice budget', new Error('builder_turn_timeout'), false],
    ['cut-off reply', new Error('local_model_output_truncated'), false],
    ['cancellation', noText(), true],
  ] as const) {
    const workspace = await setup('n')
    const controller = new AbortController()
    let calls = 0
    const agent = new BuilderV2Agent({ async generate() { calls++; if (abort) controller.abort(); throw error } },
      new BuilderV2Dispatcher(workspace, localRunner), workspace)
    await agent.run({ workspaceId: 'n', objective, maxSteps: 1, signal: controller.signal, retryDelay: async () => { assert.fail(`${name} was retried`) } })
    assert.equal(calls, 1, name)
  }
})
