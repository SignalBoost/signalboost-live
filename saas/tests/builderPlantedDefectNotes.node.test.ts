// saas/tests/builderPlantedDefectNotes.node.test.ts
//
// Production 2026-10-21 (Calculator API acceptance, SignalBoost/builder-969cca68…): the job planted a bug, repaired
// it and passed every test, yet published src/calculator.js still saying "This function intentionally contains a
// bug: it subtracts instead of adds." Builder now cannot finish a plant-a-bug job while delivered source still
// describes the planted defect; the model is told the exact comment, edits it, and the host re-verifies.
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
import { objectivePlantsDefect, plantedDefectNotes } from '../lib/builder/planted-defect-notes.ts'

const shipped = [
  '/**',
  ' * Adds two numbers.',
  ' *',
  ' * This function intentionally contains a bug: it subtracts instead of adds.',
  ' * The bug will be caught by the test suite and repaired.',
  ' */',
  'function sum(a, b) {',
  '  return Number(a) + Number(b);',
  '}',
].join('\n')

test('the comment that shipped in production is found; correct-behaviour comments and tests are not', () => {
  assert.deepEqual(plantedDefectNotes([{ path: 'src/calculator.js', content: shipped }]).map(note => note.line), [4, 5])
  assert.deepEqual(plantedDefectNotes([
    { path: 'src/calculator.js', content: '// Intentionally throws an error for invalid input.\n// Adds two numbers.\nconst x = 1 // deliberately small' },
    { path: 'test/calculator.test.js', content: '// The original implementation intentionally contained a bug.' },
    { path: 'README.md', content: 'This project intentionally contained a bug.' },
  ]), [])
  assert.equal(objectivePlantsDefect('Initially implement a defective addition function that produces an incorrect result.'), true)
  assert.equal(objectivePlantsDefect('Build a calculator API with tests.'), false)
})

const runner: BuilderRunnerPort = {
  async run({ command, files }) {
    const dir = mkdtempSync(join(tmpdir(), 'builder-planted-'))
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
const objective = (plant: boolean) => [
  'Build a calculator. Create a small project with the following files:', '',
  '- `package.json`', '- `src/calculator.js`', '- `test/calculator.test.js`', '',
  plant ? 'Initially implement a defective addition function that produces an incorrect result. Run the tests, then repair it.' : 'Implement addition.', '',
  'Execute:', '', '```bash', 'npm test', '```',
].join('\n')
const buggy = '// This function intentionally contains a bug: it subtracts instead of adds.\nmodule.exports = { sum: (a, b) => a - b }\n'
const tools = (...actions: unknown[]) => JSON.stringify({ type: 'tools', actions })
const writeAll = tools(
  { tool: 'write_file', path: 'package.json', content: '{"name":"calc","scripts":{"test":"node --test test/*.test.js"}}\n' },
  { tool: 'write_file', path: 'src/calculator.js', content: buggy },
  { tool: 'write_file', path: 'test/calculator.test.js', content: "const test = require('node:test')\nconst assert = require('node:assert')\nconst { sum } = require('../src/calculator.js')\ntest('adds', () => assert.equal(sum(2, 3), 5))\n" },
)
const repairCode = JSON.stringify({ type: 'tool', action: { tool: 'edit_file', path: 'src/calculator.js', search: 'a - b', replace: 'a + b' } })
const repairComment = JSON.stringify({ type: 'tool', action: { tool: 'edit_file', path: 'src/calculator.js',
  search: '// This function intentionally contains a bug: it subtracts instead of adds.\n', replace: '// Adds two numbers.\n' } })

test('a repaired plant-a-bug job cannot finish until the stale comment is fixed, then the host re-verifies', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const prompts: any[] = []
  const replies = [writeAll, repairCode, repairComment]
  let at = 0
  const agent = new BuilderV2Agent({ async generate(request) { prompts.push(JSON.parse(String(request.prompt))); return replies[at++] ?? null } },
    new BuilderV2Dispatcher(workspace, runner), workspace)
  const outcome = await agent.run({ workspaceId: 'calc', objective: objective(true), maxSteps: 10 })

  assert.equal(outcome.ok, true, outcome.reason)
  assert.equal(prompts.length, 3, 'write, repair the code, repair the comment')
  assert.equal(prompts[1].staleDefectComments, undefined, 'not raised while the defect is still being repaired')
  assert.deepEqual(prompts[2].staleDefectComments.map((note: any) => [note.path, note.line]), [['src/calculator.js', 1]])
  assert.deepEqual(prompts[2].nextRecommendedAction.actions, [{ tool: 'edit_file', path: 'src/calculator.js' }])
  const delivered = (await workspace.readFile('calc', 'src/calculator.js'))!.content
  assert.doesNotMatch(delivered, /intentionally/)
  const runs = outcome.steps.filter(step => step.tool === 'run_tests')
  assert.ok(outcome.steps.findLastIndex(step => step.tool === 'run_tests' && step.ok) > outcome.steps.findLastIndex(step => step.changed),
    'the host re-ran the commands after the comment edit')
  assert.equal(runs[0].ok, false, 'the planted bug was reproduced first')
})

test('a job that was not asked to plant a bug is not held back by such a comment', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let calls = 0
  const replies = [writeAll, repairCode]
  const agent = new BuilderV2Agent({ async generate() { return replies[calls++] ?? null } }, new BuilderV2Dispatcher(workspace, runner), workspace)
  const outcome = await agent.run({ workspaceId: 'calc2', objective: objective(false), maxSteps: 10 })
  assert.equal(outcome.ok, true, outcome.reason)
  assert.equal(calls, 2)
})

// Codex on #4756: text inside strings is data, never a comment.
test('a comment marker inside a string, template or Python string is not a comment; real comments still are', () => {
  assert.deepEqual(plantedDefectNotes([
    { path: 'src/messages.js', content: 'export const message = " // BUG: invalid input";\nconst t = `\n// intentionally contains a bug\n`\nconst s = \'/* BUG: x */\'\n' },
    { path: 'src/app.py', content: 'MSG = "# BUG: invalid input"\nDOC = """\n# intentionally contains a bug\n"""\n' },
  ]), [])
  assert.deepEqual(plantedDefectNotes([
    { path: 'src/a.js', content: 'const url = "http://x" // BUG: subtracts\n/*\n * line\n * deliberately returns the wrong result: a bug\n */\n' },
    { path: 'src/b.py', content: 'x = "#"  # intentionally contains a bug\n' },
  ]).map(note => [note.path, note.line]), [['src/a.js', 1], ['src/a.js', 4], ['src/b.py', 1]])
})

// Codex on #4756: 60 files listed ahead of src/ must not hide it from the check.
test('every delivered source file is checked, however many other files the workspace holds', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  for (let n = 0; n < 60; n++) await workspace.writeFile('big', `assets/a${String(n).padStart(2, '0')}.txt`, 'asset')
  const prompts: any[] = []
  const replies = [writeAll, repairCode, repairComment]
  let at = 0
  const agent = new BuilderV2Agent({ async generate(request) { prompts.push(JSON.parse(String(request.prompt))); return replies[at++] ?? null } },
    new BuilderV2Dispatcher(workspace, runner), workspace)
  const outcome = await agent.run({ workspaceId: 'big', objective: objective(true), maxSteps: 10 })
  assert.equal(outcome.ok, true, outcome.reason)
  assert.deepEqual(prompts[2].staleDefectComments.map((note: any) => note.path), ['src/calculator.js'])
  assert.doesNotMatch((await workspace.readFile('big', 'src/calculator.js'))!.content, /intentionally/)
})
