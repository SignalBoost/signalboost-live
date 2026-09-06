// saas/tests/builderRepairClassification.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isRepairObjective } from '../lib/builder/regression-gate.ts'

const toolLoop = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')
const jobRunner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')

// The exact production objective that was misclassified: a greenfield build whose
// acceptance criteria mention "fix", "error" and "failures".
const BUILD_FROM_SCRATCH = [
  'Build a Node.js expense-report CLI using only built-in modules.',
  '',
  'Create:',
  '- expenses.js',
  '- expenses.test.js',
  '- sample.csv',
  '- README.md',
  '',
  'Reject invalid dates, missing columns, and malformed amounts with a clear error and nonzero exit code.',
  'Write at least 10 meaningful automated tests covering normal input, edge cases, and failures.',
  'If any test fails, fix the implementation and rerun it.',
].join('\n')

test('a greenfield build objective is not a repair objective just because it says fix, error or failures', () => {
  assert.equal(isRepairObjective(BUILD_FROM_SCRATCH), false)
})

test('creation directives with incidental repair vocabulary stay build objectives', () => {
  assert.equal(isRepairObjective('Create a CSV parser that rejects malformed rows with a clear error.'), false)
  assert.equal(isRepairObjective('Write a retry helper and fix up the exported names before finishing.'), false)
  assert.equal(isRepairObjective('Please implement a logger; tests must cover failure paths.'), false)
  assert.equal(isRepairObjective('Generate a README describing the error codes.'), false)
})

test('genuine repair requests are still repair objectives', () => {
  assert.equal(isRepairObjective('Fix the failing Builder regression and prove the repair.'), true)
  assert.equal(isRepairObjective('Fix the TypeScript failure.'), true)
  assert.equal(isRepairObjective('The parser is broken on CRLF input.'), true)
  assert.equal(isRepairObjective('Repair the crash in expenses.js.'), true)
})

test('a build request that carries supplied failure evidence is still a repair objective', () => {
  assert.equal(isRepairObjective('Build a parser.\nTypeError: cannot read properties of undefined'), true)
  assert.equal(isRepairObjective('Create the missing test — the suite still fails on CRLF.'), true)
  assert.equal(isRepairObjective('Write the fix. The command exits with exit code 1.'), true)
  assert.equal(isRepairObjective('Make the uploader work again — this bug blocks the release.'), true)
})

test('objectives with no repair vocabulary at all remain build objectives', () => {
  assert.equal(isRepairObjective('Build a Node.js expense-report CLI using only built-in modules.'), false)
  assert.equal(isRepairObjective(''), false)
})

test('repair classification is never derived from the model own answer prose', () => {
  assert.doesNotMatch(toolLoop, /isRepairObjective\(action\.answer\)/)
  assert.match(toolLoop, /isRepairObjective\(`\$\{input\.objective\}\\n\$\{action\.answer\}`\)/)
  assert.match(toolLoop, /if \(mutation && initialPaths\.has\(toolPath\(action\.input\)\) && !extendingProject\) repairObjective = true/)
})

test('a build objective gets a round budget that can carry a multi-file build', () => {
  assert.match(jobRunner, /maxRounds: 96/)
  assert.match(gate, /tests\/builderRepairClassification\.node\.test\.ts/)
})

test('ambiguous documentation intent uses the model but only permits explicitly named document paths', async () => {
  const { classifyBuilderDocumentationIntent, validBuilderDocumentationScope } = await import('../lib/builder/documentation-intent.ts')
  const objective = 'Extend README.md with guidance for the existing missing-input-file error. Inspect cli.js and preserve implementation and tests. Run npm test.'
  const requests: any[] = []
  const scope = await classifyBuilderDocumentationIntent({ async generate(request) { requests.push(request); return '{"documentationOnly":true,"writePaths":["README.md"]}' } }, objective)
  assert.deepEqual(scope, ['README.md'])
  assert.equal(requests.length, 1)
  assert.equal(JSON.parse(requests[0].prompt).objective, objective)
  assert.equal(validBuilderDocumentationScope(objective, ['cli.js']), false)
  assert.equal(validBuilderDocumentationScope(objective, ['other.md']), false)
  for (const response of ['{"documentationOnly":false}', '{}', 'invalid']) {
    assert.equal(await classifyBuilderDocumentationIntent({ async generate() { return response } }, objective), null)
  }
  assert.equal(await classifyBuilderDocumentationIntent({ async generate() { throw new Error('offline') } }, objective), null)
})

test('documentation extension edits its document and accepts a passing requested check without invented failure', async () => {
  const { BuilderToolLoop } = await import('../lib/builder/tool-loop.ts')
  const { InMemoryBuilderWorkspace } = await import('../lib/builder/workspace.ts')
  const { execFileSync } = await import('node:child_process')
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('docs', 'README.md', '# Usage\n')
  await workspace.writeFile('docs', 'cli.js', 'console.log("unchanged")')
  const responses = [JSON.stringify({ type: 'tool', toolId: 'edit_file', input: { path: 'README.md', search: '# Usage', replace: '# Usage\nMissing file errors mean you should check the input path.' } }),
    JSON.stringify({ type: 'tool', toolId: 'run', input: { command: 'node cli.js' } })]
  const result = await new BuilderToolLoop({ async generate() { return responses.shift() || null } }, workspace, {
    async run(request) { return { exitCode: 0, stdout: execFileSync(process.execPath, ['-e', request.files.find(file => file.path === 'cli.js')!.content], { encoding: 'utf8' }), stderr: '', timedOut: false, generatedFiles: [{ path: 'package-lock.json', content: '{"lockfileVersion":3,"packages":{}}' }] } },
  }).run({ objective: 'Extend README.md with guidance about an existing error. Run node cli.js.', workspaceId: 'docs', documentationPaths: ['README.md'] })
  assert.equal(result.ok, true)
  assert.match((await workspace.readFile('docs', 'README.md'))!.content, /Missing file/)
  assert.equal((await workspace.readFile('docs', 'cli.js'))!.content, 'console.log("unchanged")')
  assert.equal(result.trace.filter(item => item.toolId === 'run').length, 1)
  assert.equal(await workspace.readFile('docs', 'package-lock.json'), null)
  assert.equal(result.trace.some(item => item.toolId === 'write_file' && item.input.path === 'package-lock.json'), false)
})

test('documentation mode cannot mutate implementation even when the reasoner asks for it', async () => {
  const { BuilderToolLoop } = await import('../lib/builder/tool-loop.ts')
  const { InMemoryBuilderWorkspace } = await import('../lib/builder/workspace.ts')
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('scope', 'README.md', 'docs')
  await workspace.writeFile('scope', 'cli.js', 'original')
  const result = await new BuilderToolLoop({ async generate() { return '{"type":"tool","toolId":"write_file","input":{"path":"cli.js","content":"changed"}}' } }, workspace,
    { async run() { assert.fail('must not execute'); return null as never } }).run({ objective: 'Extend README.md to describe the error.', workspaceId: 'scope', documentationPaths: ['README.md'], maxRounds: 1 })
  assert.equal(result.ok, false)
  assert.ok(result.trace.some(item => item.error === 'builder_documentation_scope_violation'))
  assert.equal((await workspace.readFile('scope', 'cli.js'))!.content, 'original')
})

test('documentation scope survives checkpoints and failed checks cannot be accepted as success', async () => {
  const { BuilderToolLoop } = await import('../lib/builder/tool-loop.ts')
  const { InMemoryBuilderWorkspace } = await import('../lib/builder/workspace.ts')
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('checkpoint-docs', 'README.md', 'original')
  const ai = { async generate() { return '{"type":"tool","toolId":"run","input":{"command":"npm test"}}' } }
  const runner = { async run() { return { exitCode: 1, stdout: '', stderr: 'test failed', timedOut: false } } }
  const paused = await new BuilderToolLoop(ai, workspace, runner).run({ objective: 'Extend README.md to explain errors. Run npm test.', workspaceId: 'checkpoint-docs', documentationPaths: ['README.md'], shouldPause: () => true })
  assert.equal(paused.ok, false)
  assert.ok(!paused.ok && paused.checkpoint)
  if (paused.ok || !paused.checkpoint) return
  assert.deepEqual(paused.checkpoint.documentationPaths, ['README.md'])
  const resumed = await new BuilderToolLoop(ai, workspace, runner).run({ objective: 'Extend README.md to explain errors. Run npm test.', workspaceId: 'checkpoint-docs', checkpoint: JSON.parse(JSON.stringify(paused.checkpoint)), maxRounds: 1 })
  assert.equal(resumed.ok, false)
  assert.ok(resumed.trace.some(item => item.toolId === 'run' && item.ok === false))
})


test('reference and explicitly preserved documents are not writable documentation targets', async () => {
  const { classifyBuilderDocumentationIntent, validBuilderDocumentationScope } = await import('../lib/builder/documentation-intent.ts')
  const objective = 'Extend README.md with error guidance from docs/guide.md; do not modify docs/guide.md.'
  const accepted = await classifyBuilderDocumentationIntent({ async generate() { return '{"documentationOnly":true,"writePaths":["README.md"]}' } }, objective)
  assert.deepEqual(accepted, ['README.md'])
  assert.equal(validBuilderDocumentationScope(objective, ['README.md', 'docs/guide.md']), false)
  assert.equal(await classifyBuilderDocumentationIntent({ async generate() { return '{"documentationOnly":true,"writePaths":["README.md","docs/guide.md"]}' } }, objective), null)
  assert.equal(await classifyBuilderDocumentationIntent({ async generate() { return '{"documentationOnly":true}' } }, objective), null)
})
