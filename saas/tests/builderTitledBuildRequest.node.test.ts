// saas/tests/builderTitledBuildRequest.node.test.ts
//
// Production 2026-10-13 (jobs 2e461f72, 9d3f4e28): the owner sent a build request that opened with a Markdown title,
// "# COS Builder Advanced Stress Test — OrderFlow", above "Build a complete, working Node.js order management
// application … from scratch". Builder read only the title as the opening instruction, missed "Build", and its
// acceptance criteria (errors, failing tests) made it a repair. A repair in an empty workspace ends with
// builder_source_required, so the build never started. Titles and dividers are now skipped when finding the instruction.
import assert from 'node:assert/strict'
import test from 'node:test'
import { isRepairObjective } from '../lib/builder/regression-gate.ts'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const ORDERFLOW = [
  '# COS Builder Advanced Stress Test — OrderFlow',
  '',
  'Build a complete, working Node.js order management application called **OrderFlow**, from scratch, in a new isolated workspace. This is a software engineering and verification task, not a documentation task.',
  '',
  '## 1. Technical requirements',
  '- JavaScript, Node.js 20+, CommonJS modules.',
  '- Use `node:test` and `node:assert/strict`.',
  '- Invalid input must throw a ValidationError with a clear error message.',
  '',
  '## 2. Verification',
  '- Write at least 30 tests, including failure cases.',
  '- If any test fails, fix the implementation and rerun it.',
].join('\n')

test('a build request under a Markdown title is a build, not a repair', () => {
  assert.equal(isRepairObjective(ORDERFLOW), false)
  assert.equal(isRepairObjective(`---\n${ORDERFLOW}`), false, 'a divider is not the instruction either')
  assert.equal(isRepairObjective('### Task\n***\nCreate a CSV parser that rejects malformed rows with a clear error.'), false)
})

test('titled repair requests and pasted failures are still repairs', () => {
  assert.equal(isRepairObjective('# Bug\nFix the failing checkout test.'), true)
  assert.equal(isRepairObjective('# Fix the login crash\nThe login page crashes after submit.'), true)
  assert.equal(isRepairObjective('## Build failure\nThe build fails on every deploy.'), true)
  assert.equal(isRepairObjective('# Report\nTypeError: Cannot read properties of undefined (reading \'id\')\n    at load (app.js:4:9)'), true)
})

test('the titled build starts in an empty workspace instead of stopping at "no source files"', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let modelCalled = false
  const ai = { async generate() { modelCalled = true; return JSON.stringify({ type: 'final', text: 'stop' }) } }
  const runner = { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: ORDERFLOW, workspaceId: 'orderflow' })
  assert.notEqual(result.ok === false ? result.error : '', 'builder_source_required')
  assert.equal(modelCalled, true, 'the model was asked to start building')
})

test('a repair with no source still stops and asks for it', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const ai = { async generate(): Promise<string> { throw new Error('the model must not run without source') } }
  const runner = { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: '# Bug\nFix the failing checkout test.', workspaceId: 'empty' })
  assert.equal(result.ok, false)
  assert.equal(result.ok === false ? result.error : '', 'builder_source_required')
})
// end of saas/tests/builderTitledBuildRequest.node.test.ts (if this line is missing, the paste was cut short)
