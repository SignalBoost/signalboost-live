// saas/tests/builderV2WorkingSet.node.test.ts
// Production 2026-10-17, job 00dd6e7d (OrderFlow): after npm test failed, the model read the same files 16 times over
// 5 work slices and never edited. Each read pushed the failure output and the earlier reads out of the prompt's
// 8-receipt tail. Like Aider's files "in the chat", every prompt now carries the failing command output and the current
// content of the files the model has opened, within this slice and after resuming from a checkpoint.
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

const localRunner: BuilderRunnerPort = {
  async run({ command, files }) {
    const dir = mkdtempSync(join(tmpdir(), 'builder-v2-ws-'))
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
// The production defect: the tests call createCatalog, the module exports a class.
const files: Record<string, string> = {
  'package.json': '{"name":"miniflow","version":"1.0.0","scripts":{"test":"node --test test/*.test.js"}}\n',
  'src/catalog.js': 'class Catalog {\n  constructor() { this.items = [] }\n  add(item) { this.items.push(item); return item }\n}\nmodule.exports = { Catalog }\n',
  'test/catalog.test.js': "const test = require('node:test')\nconst assert = require('node:assert')\nconst { createCatalog } = require('../src/catalog.js')\ntest('adds', () => assert.equal(createCatalog().add(1), 1))\ntest('starts empty', () => assert.equal(createCatalog().items.length, 0))\n",
  'index.js': "const { Catalog } = require('./src/catalog.js')\nconsole.log('items', new Catalog().items.length)\n",
}
const read = (path: string) => JSON.stringify({ type: 'tool', action: { tool: 'read_file', path } })

test('the failing output and the opened files stay in every prompt, also after resuming the next slice', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  for (const [path, content] of Object.entries(files)) await workspace.writeFile('w', path, content)
  const prompts: Record<string, any>[] = []
  // More reads than the 8-receipt tail holds, as the production model did.
  const replies = ['src/catalog.js', 'test/catalog.test.js', 'index.js', 'package.json', 'src/catalog.js', 'test/catalog.test.js',
    'index.js', 'package.json', 'src/catalog.js', 'test/catalog.test.js'].map(read)
  let at = 0
  const ai = { async generate(request: { prompt: string }) { prompts.push(JSON.parse(request.prompt)); return replies[at++] ?? null } }
  const first = await new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, localRunner), workspace)
    .run({ workspaceId: 'w', objective, maxSteps: 10 })
  assert.ok(first.checkpoint, first.reason)
  for (const prompt of prompts) {
    assert.equal(prompt.failingCommand?.command, 'npm test')
    assert.match(prompt.failingCommand.output, /createCatalog is not a function/)
  }
  const last = prompts.at(-1)!
  assert.deepEqual(Object.keys(last.openFiles).sort(), ['index.js', 'package.json', 'src/catalog.js', 'test/catalog.test.js'])
  assert.equal(last.openFiles['src/catalog.js'], files['src/catalog.js'])
  // Old read receipts in the tail no longer repeat the content.
  assert.ok(last.tail.every((receipt: any) => receipt.tool !== 'read_file' || receipt.output.content === 'see openFiles'))

  // Next slice, resumed from the checkpoint: the model still sees the failure and the files without reading again.
  let resumedPrompt: Record<string, any> | undefined
  const fix = JSON.stringify({ type: 'tool', action: { tool: 'edit_file', path: 'test/catalog.test.js', search: "const { createCatalog } = require('../src/catalog.js')", replace: "const { Catalog } = require('../src/catalog.js')\nconst createCatalog = () => new Catalog()" } })
  const resumed = await new BuilderV2Agent({ async generate(request) { resumedPrompt ??= JSON.parse(String(request.prompt)); return fix } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace).run({ workspaceId: 'w', objective, maxSteps: 2, checkpoint: first.checkpoint })
  assert.match(resumedPrompt!.failingCommand.output, /createCatalog is not a function/)
  assert.equal(resumedPrompt!.openFiles['test/catalog.test.js'], files['test/catalog.test.js'])
  assert.equal(resumed.ok, true, resumed.reason)
})

test('the working set stays within its budget', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  for (const [path, content] of Object.entries(files)) await workspace.writeFile('b', path, content)
  await workspace.writeFile('b', 'src/big.js', `// ${'x'.repeat(30_000)}\n`)
  const prompts: Record<string, any>[] = []
  const replies = [read('src/big.js'), read('src/catalog.js')]
  let at = 0
  await new BuilderV2Agent({ async generate(request) { prompts.push(JSON.parse(String(request.prompt))); return replies[at++] ?? null } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace).run({ workspaceId: 'b', objective, maxSteps: 3 })
  const last = prompts.at(-1)!
  assert.equal(last.openFiles['src/big.js'], undefined)
  assert.equal(last.openFiles['src/catalog.js'], files['src/catalog.js'])
})
