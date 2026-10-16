// saas/tests/builderV2SyntaxCheck.node.test.ts
// Windsurf-style immediate check of generated code: syntax errors come back on the write receipt.
import test from 'node:test'
import assert from 'node:assert/strict'
import { builderSyntaxError } from '../lib/builder/syntax-check.ts'
import { BuilderV2Agent } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderRunnerPort } from '../lib/builder/contracts.ts'

test('JSON and CommonJS files are compiled, never executed', () => {
  assert.equal(builderSyntaxError('package.json', '{"name":"a"}'), null)
  assert.match(builderSyntaxError('package.json', '{"name":"a",}') ?? '', /^package\.json: .*JSON/)
  assert.equal(builderSyntaxError('src/a.js', 'module.exports = () => 1\n'), null)
  assert.equal(builderSyntaxError('bin/cli.js', '#!/usr/bin/env node\nif (!process.argv) return\nconsole.log(1)\n'), null)
  assert.match(builderSyntaxError('src/cart.js', 'function total(items) {\n  return items.reduce((s, i) => s + i.price, 0\n}\n') ?? '', /^src\/cart\.js:\d+: /)
  assert.equal(builderSyntaxError('src/a.js', 'process.exit(1); throw new Error("ran")\n'), null, 'compile only: the code never runs')
  // ES modules and other file types are left to the real command run.
  assert.equal(builderSyntaxError('src/m.js', "import x from './x.js'\nexport default x\n"), null)
  assert.equal(builderSyntaxError('README.md', '# {{{'), null)
})

test('a broken file stops the batch, host verification waits, and the repair lets the build finish', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let runs = 0
  const runner: BuilderRunnerPort = { async run() { runs++; return { exitCode: 0, stdout: '# pass 1\n# fail 0', stderr: '', timedOut: false } } }
  const objective = 'Build app.\nCreate all 2 files:\n```text\napp/\n├── index.js\n└── src/\n    └── a.js\n```\n## Mandatory verification\nExecute all one commands:\n```bash\nnode index.js\n```'
  const prompts: string[] = []
  const replies = [
    JSON.stringify({ type: 'tools', actions: [
      { tool: 'write_file', path: 'src/a.js', content: 'module.exports = () => (1\n' },
      { tool: 'write_file', path: 'index.js', content: "require('./src/a.js')\n" },
    ] }),
    JSON.stringify({ type: 'tools', actions: [
      { tool: 'edit_file', path: 'src/a.js', search: '(1\n', replace: '(1)\n' },
      { tool: 'write_file', path: 'index.js', content: "require('./src/a.js')\n" },
    ] }),
  ]
  let at = 0
  const agent = new BuilderV2Agent({ async generate(request) { prompts.push(String(request.prompt)); return replies[at++] ?? null } },
    new BuilderV2Dispatcher(workspace, runner), workspace)
  const outcome = await agent.run({ workspaceId: 'sx', objective, maxSteps: 4 })

  assert.equal(outcome.ok, true, outcome.reason)
  // First batch: src/a.js written with a syntax error, index.js not written on top of it, no command run.
  assert.match(prompts[1], /syntaxError/)
  assert.match(prompts[1], /src\/a\.js:\d+: /)
  assert.equal(outcome.steps[0].tool, 'write_file')
  assert.equal(outcome.steps[1].tool, 'edit_file')
  // Host verification ran once, after the repair made every file compile.
  assert.equal(runs, 1)
})
