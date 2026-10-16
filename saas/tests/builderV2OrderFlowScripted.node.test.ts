// saas/tests/builderV2OrderFlowScripted.node.test.ts
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
    const dir = mkdtempSync(join(tmpdir(), 'builder-v2-'))
    try {
      for (const file of files) {
        mkdirSync(dirname(join(dir, file.path)), { recursive: true })
        writeFileSync(join(dir, file.path), file.content)
      }
      // The child is its own test process, not a subtest of this one.
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'))
      const result = spawnSync('sh', ['-c', command], { cwd: dir, encoding: 'utf8', timeout: 60_000, env })
      return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr, timedOut: result.error?.name === 'Error' && result.signal === 'SIGTERM' }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
}

const objective = [
  '# MiniFlow — Builder V2 acceptance',
  '## Objective',
  'Build a complete, working **MiniFlow** application using Node.js.',
  '## Required project structure',
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
  '## Automated tests',
  'Implement at least **2 meaningful automated tests**.',
  '## Mandatory verification',
  'Execute all two commands:',
  '```bash',
  'node --test test/*.test.js',
  'node index.js',
  '```',
].join('\n')

const tool = (action: Record<string, unknown>) => JSON.stringify({ type: 'tool', action })

test('Builder V2 builds a drawn-tree spec end to end: fenced replies, checklist gate, tolerant repair, real test runs', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const replies = [
    '```json\n' + tool({ tool: 'write_file', path: 'package.json', content: '{"name":"miniflow","type":"commonjs","scripts":{"test":"node --test test/*.test.js"}}' }) + '\n```',
    '<think>cart next</think>' + tool({ tool: 'write_file', path: 'src/cart.js', content: 'function total(items) {\n  return items.reduce((sum, item) => sum + item.price, 0)\n}\nmodule.exports = { total }\n' }),
    tool({ tool: 'write_file', path: 'test/cart.test.js', content: "const test = require('node:test')\nconst assert = require('node:assert')\nconst { total } = require('../src/cart.js')\ntest('total multiplies quantity', () => assert.equal(total([{ price: 2, qty: 3 }]), 6))\ntest('empty cart is zero', () => assert.equal(total([]), 0))\n" }),
    JSON.stringify({ type: 'finish', summary: 'done early' }),
    tool({ tool: 'write_file', path: 'index.js', content: "const { total } = require('./src/cart.js')\nconsole.log('Order total:', total([{ price: 5, qty: 2 }]))\n" }),
    tool({ tool: 'run_tests', command: 'node --test test/*.test.js' }),
    'Here is the fix:\n' + tool({ tool: 'edit_file', path: 'src/cart.js', search: 'return items.reduce((sum, item) => sum + item.price, 0)', replace: 'return items.reduce((sum, item) => sum + item.price * item.qty, 0)' }),
    tool({ tool: 'run_tests', command: 'node --test test/*.test.js' }),
    tool({ tool: 'run_tests', command: 'node index.js' }),
    JSON.stringify({ type: 'finish', summary: 'MiniFlow verified' }),
  ]
  const prompts: string[] = []
  let at = 0
  const agent = new BuilderV2Agent({ async generate(request) { prompts.push(String(request.prompt)); return replies[at++] ?? null } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace)
  const outcome = await agent.run({ workspaceId: 'mini', objective, maxSteps: 24 })

  assert.equal(outcome.ok, true, outcome.reason)
  assert.equal(outcome.summary, 'MiniFlow verified')
  // The checklist the model saw is the full drawn-tree contract.
  const checklist = JSON.parse(prompts[0]).checklist
  assert.deepEqual(checklist.files, ['package.json', 'index.js', 'src/cart.js', 'test/cart.test.js'])
  assert.deepEqual(checklist.commands, ['node --test test/*.test.js', 'node index.js'])
  assert.equal(checklist.minimumTests, 2)
  // The early, unverified finish was returned to the model as feedback naming the missing file.
  assert.match(prompts[4], /builder_v2_unverified_completion/)
  assert.match(prompts[4], /index\.js/)
  // Real failing run, tolerant edit, real passing runs.
  const runs = outcome.steps.filter(step => step.tool === 'run_tests')
  assert.deepEqual(runs.map(step => step.ok), [false, true, true])
  assert.match(String((runs[1].output as { stdout: string }).stdout), /# pass 2|ℹ pass 2/)
  assert.match(String((runs[2].output as { stdout: string }).stdout), /Order total: 10/)
  assert.match((await workspace.readFile('mini', 'src/cart.js'))!.content, /item\.price \* item\.qty/)
})

test('Builder V2 still fails closed on a reply with no complete control object', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const agent = new BuilderV2Agent({ async generate() { return 'I will now write the files {"type":"tool"' } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace)
  const outcome = await agent.run({ workspaceId: 'bad', objective, maxSteps: 4 })
  assert.equal(outcome.ok, false)
  assert.equal(outcome.reason, 'builder_v2_invalid_model_action')
})
