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
  assert.match(toolLoop, /if \(mutation && initialPaths\.has\(toolPath\(action\.input\)\)\) repairObjective = true/)
})

test('a build objective gets a round budget that can carry a multi-file build', () => {
  assert.match(jobRunner, /maxRounds: 96/)
  assert.match(gate, /tests\/builderRepairClassification\.node\.test\.ts/)
})
