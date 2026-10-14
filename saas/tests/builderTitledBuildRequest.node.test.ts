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
import { readFileSync } from 'node:fs'

// The owner's exact OrderFlow request as sent (2026-10-13). "If a test fails, identify the defect…" in section 5 kept
// it a repair after #4312: a complaint phrase ("the defect") overrode the build directive.
const ORDERFLOW_FULL = readFileSync(new URL('./fixtures/builder-orderflow-request.md', import.meta.url), 'utf8')
  .replace(/^<!--.*-->\n/, '')

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

test("the owner's full OrderFlow request is a build, not a repair", () => {
  assert.match(ORDERFLOW_FULL, /identify the defect/)
  assert.equal(isRepairObjective(ORDERFLOW_FULL), false)
})

test('a hypothetical "if it fails" clause under a build directive stays a build; a present defect stays a repair', () => {
  assert.equal(isRepairObjective('Create a retry helper.\nIf a call fails, identify the defect and retry.'), false)
  assert.equal(isRepairObjective('Write a CSV importer.\n- If any test fails, fix the bug and rerun it.'), false)
  assert.equal(isRepairObjective('Create a regression test and fix the bug.'), true)
  assert.equal(isRepairObjective('Create the missing test — this bug blocks the release.'), true)
  assert.equal(isRepairObjective('Write the parser again; it still fails on CRLF.'), true)
  assert.equal(isRepairObjective('If you can, look at it: the checkout still fails.'), true, 'a report after the clause still counts')
})

test('a build directive with pasted failure output is still a repair', () => {
  assert.equal(isRepairObjective('Build passes locally but CI shows:\nTypeError: x is not a function\n    at run (src/app.js:4:9)'), true)
  assert.equal(isRepairObjective('Make the deploy work again.\nnpm ERR! code ELIFECYCLE'), true)
})

test('complaints in prose are still repairs without a build directive', () => {
  assert.equal(isRepairObjective('The checkout still fails after the last deploy.'), true)
  assert.equal(isRepairObjective('Login is not working.'), true)
  assert.equal(isRepairObjective('Please look at the defect in cart totals.'), true)
})

test('titled repair requests and pasted failures are still repairs', () => {
  assert.equal(isRepairObjective('# Bug\nFix the failing checkout test.'), true)
  assert.equal(isRepairObjective('# Fix the login crash\nThe login page crashes after submit.'), true)
  assert.equal(isRepairObjective('## Build failure\nThe build fails on every deploy.'), true)
  assert.equal(isRepairObjective('# Report\nTypeError: Cannot read properties of undefined (reading \'id\')\n    at load (app.js:4:9)'), true)
})

test('the full OrderFlow build starts in an empty workspace instead of stopping at "no source files"', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let modelCalled = false
  const ai = { async generate() { modelCalled = true; return JSON.stringify({ type: 'final', text: 'stop' }) } }
  const runner = { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: ORDERFLOW_FULL, workspaceId: 'orderflow' })
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
