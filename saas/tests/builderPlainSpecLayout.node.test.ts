// saas/tests/builderPlainSpecLayout.node.test.ts
// Production 2026-10-23: the owner's LibraryFlow request, copied from a rendered page, lost its Markdown: it opened
// with the bare label "Objective", "Project structure" and "Verification commands" were plain lines, and each code
// block left a stray "text"/"bash" line. Builder read 0 files and 0 commands, reused the previous calculator
// workspace, and stopped with 0 of 20 tests passing.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { builderTaskContract } from '../lib/builder/task-contract.ts'
import { isNewBuilderProjectObjective } from '../lib/builder/project-continuity.ts'
import { isRepairObjective, openingDirective } from '../lib/builder/regression-gate.ts'

const libraryflow = readFileSync(new URL('./fixtures/builder-libraryflow-plain.txt', import.meta.url), 'utf8')

test('a request copied without Markdown still yields its whole checklist', () => {
  const contract = builderTaskContract(libraryflow)
  assert.deepEqual(contract.files, [
    'package.json', 'README.md', 'index.js',
    'src/catalog.js', 'src/borrow.js', 'src/return.js', 'src/transactions.js', 'src/reports.js', 'src/errors.js',
    'test/catalog.test.js', 'test/borrow.test.js', 'test/return.test.js', 'test/transactions.test.js', 'test/reports.test.js',
  ])
  assert.deepEqual(contract.commands, ['npm test', 'node --test test/*.test.js', 'node index.js'])
  assert.equal(contract.minimumTests, 20)
})

test('a bare section label is not the instruction, and a Node.js application is a new project', () => {
  assert.match(openingDirective(libraryflow), /^Build a complete Node\.js application called LibraryFlow/)
  assert.equal(isNewBuilderProjectObjective(libraryflow), true)
  // A feature for the current project stays in it.
  assert.equal(isNewBuilderProjectObjective('Objective\nImplement order cancellation in our existing app.\nRun:\nnpm test'), false)
})

test('a bare document title above the sections is not the instruction (LibraryFlow with its title)', () => {
  // Production 2026-10-23: "COS Builder Stress Test — LibraryFlow" above "Objective" turned the build into a repair.
  const titled = readFileSync(new URL('./fixtures/builder-libraryflow-titled-plain.txt', import.meta.url), 'utf8')
  assert.match(openingDirective(titled), /^Build a complete Node\.js application called LibraryFlow/)
  assert.equal(isNewBuilderProjectObjective(titled), true)
  assert.equal(isRepairObjective(titled), false)
  assert.equal(builderTaskContract(titled).files.length, 14)
  // A short instruction followed by a section label is still the instruction.
  assert.equal(openingDirective('Fix the login bug\nRequirements\nThe form must submit.'), 'Fix the login bug')
  assert.equal(isRepairObjective('Fix the login bug\nRequirements\nThe form must submit without an error.'), true)
})
