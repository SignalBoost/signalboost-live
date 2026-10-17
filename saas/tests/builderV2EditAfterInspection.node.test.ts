// saas/tests/builderV2EditAfterInspection.node.test.ts
// Production job 00dd6e7d (OrderFlow): after npm test failed, the model read files 16 times over 5 work slices and never
// edited. Like Aider's cap of 3 reflections and Cline's warning at 3 identical calls, after 3 inspections following a
// failure Builder V2 refuses further reads and requires an edit; the failure and opened files are already in the prompt.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { BuilderV2Agent, BUILDER_V2_INSPECTIONS_BEFORE_EDIT } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderRunnerPort } from '../lib/builder/contracts.ts'

const localRunner: BuilderRunnerPort = {
  async run({ command, files }) {
    const dir = mkdtempSync(join(tmpdir(), 'builder-v2-edit-'))
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
  'miniflow/', '├── package.json', '├── index.js', '├── src', '│   └── catalog.js', '└── test', '    └── catalog.test.js', '```',
  'Implement at least **2 meaningful automated tests**.', '## Mandatory verification', 'Execute all three commands:', '```bash',
  'npm test', 'node --test test/*.test.js', 'node index.js', '```'].join('\n')
const files: Record<string, string> = {
  'package.json': '{"name":"miniflow","version":"1.0.0","scripts":{"test":"node --test test/*.test.js"}}\n',
  'src/catalog.js': 'class Catalog {\n  constructor() { this.items = [] }\n  add(item) { this.items.push(item); return item }\n}\nmodule.exports = { Catalog }\n',
  'test/catalog.test.js': "const test = require('node:test')\nconst assert = require('node:assert')\nconst { createCatalog } = require('../src/catalog.js')\ntest('adds', () => assert.equal(createCatalog().add(1), 1))\ntest('starts empty', () => assert.equal(createCatalog().items.length, 0))\n",
  'index.js': "const { Catalog } = require('./src/catalog.js')\nconsole.log('items', new Catalog().items.length)\n",
}
const read = (path: string) => JSON.stringify({ type: 'tool', action: { tool: 'read_file', path } })
const fix = JSON.stringify({ type: 'tool', action: { tool: 'edit_file', path: 'test/catalog.test.js', search: "const { createCatalog } = require('../src/catalog.js')", replace: "const { Catalog } = require('../src/catalog.js')\nconst createCatalog = () => new Catalog()" } })

async function seeded(id: string) {
  const workspace = new InMemoryBuilderWorkspace()
  for (const [path, content] of Object.entries(files)) await workspace.writeFile(id, path, content)
  return workspace
}

test('after three inspections following a failure, reads are refused until the model edits; then the build verifies', async () => {
  const workspace = await seeded('w')
  const replies = [read('src/catalog.js'), read('test/catalog.test.js'), read('index.js'), read('package.json'), read('src/catalog.js'), fix]
  const prompts: Record<string, any>[] = []
  let at = 0
  const outcome = await new BuilderV2Agent({ async generate(request) { prompts.push(JSON.parse(String(request.prompt))); return replies[at++] ?? null } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace).run({ workspaceId: 'w', objective, maxSteps: 8 })
  assert.equal(outcome.ok, true, outcome.reason)
  const tools = outcome.steps.map(step => step.tool)
  assert.equal(tools.filter(tool => tool === 'read_file').length, BUILDER_V2_INSPECTIONS_BEFORE_EDIT)
  assert.match(prompts[4].lastReceipt, /builder_v2_edit_required/)
  assert.match(prompts[5].lastReceipt, /builder_v2_edit_required/)
  assert.deepEqual(outcome.steps.filter(step => step.tool === 'run_tests').map(step => step.ok), [false, true, true, true])
})

test('a model that only keeps reading pauses its slice instead of reading forever', async () => {
  const workspace = await seeded('r')
  let calls = 0
  const outcome = await new BuilderV2Agent({ async generate() { calls++; return read(['src/catalog.js', 'index.js', 'package.json', 'test/catalog.test.js'][calls % 4]) } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace).run({ workspaceId: 'r', objective, maxSteps: 30 })
  assert.equal(outcome.reason, 'builder_v2_step_budget')
  assert.ok(outcome.checkpoint)
  assert.ok(calls < 10, `paused after ${calls} model calls`)
})

test('reading is allowed again once a file has changed', async () => {
  const workspace = await seeded('c')
  const partial = JSON.stringify({ type: 'tool', action: { tool: 'edit_file', path: 'index.js', search: "console.log('items'", replace: "console.log('catalog items'" } })
  const replies = [read('src/catalog.js'), read('test/catalog.test.js'), read('index.js'), partial, read('src/catalog.js'), fix]
  let at = 0
  const outcome = await new BuilderV2Agent({ async generate() { return replies[at++] ?? null } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace).run({ workspaceId: 'c', objective, maxSteps: 8 })
  assert.equal(outcome.ok, true, outcome.reason)
  assert.equal(outcome.steps.filter(step => step.tool === 'read_file').length, 4)
})
