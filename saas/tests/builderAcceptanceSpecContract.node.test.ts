// saas/tests/builderAcceptanceSpecContract.node.test.ts
//
// Production 2026-10-21 (job on workspace 2ad6ac0c): the owner's Calculator API acceptance spec stopped with
// builder_acceptance_required_command_unverified. Builder's own checklist read nothing from the spec — no files,
// no commands — because the spec says "Create an isolated Node.js project with the following files:" and lists its
// commands under a bare "Execute:". With an empty checklist the model decided completion and stopped after
// `npm test`; the host never ran `node --test test/*.test.js`. The checklist now carries the spec's files, both
// commands and the test count, so the host itself runs every required command before Builder can finish.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { builderTaskContract } from '../lib/builder/task-contract.ts'
import { builderV2Acceptance } from '../lib/builder/agent-v2.ts'
import { builderAcceptanceLedger } from '../lib/builder/acceptance-ledger.ts'
import type { BuilderV2Receipt } from '../lib/builder/agent-v2-dispatcher.ts'

const source = readFileSync(new URL('./builderTitledSpecificationRouting.node.test.ts', import.meta.url), 'utf8')
const spec: string = JSON.parse(source.slice(source.indexOf('const spec = ') + 'const spec = '.length, source.indexOf('\nconst conversationId')))
const files = ['package.json', 'index.js', 'src/calculator.js', 'test/calculator.test.js']
const write = (path: string): BuilderV2Receipt => ({ tool: 'write_file', ok: true, changed: true, output: { path } })
const run = (command: string, ok: boolean): BuilderV2Receipt => ({
  tool: 'run_tests', ok, changed: false,
  output: { requestedCommand: command, executedCommand: command, exitCode: ok ? 0 : 1, timedOut: false,
    stdout: ok ? '# tests 12\n# pass 12\n# fail 0' : '# tests 12\n# pass 9\n# fail 3' },
})

test('the acceptance spec yields its four files, both commands and the minimum test count', () => {
  const contract = builderTaskContract(spec)
  assert.deepEqual(contract.files, files)
  assert.deepEqual(contract.commands, ['npm test', 'node --test test/*.test.js'])
  assert.equal(contract.minimumTests, 10)
})

test('the production trace (npm test only) is not complete; Builder must run the second command itself', () => {
  const production = [...files.map(write), run('npm test', false), { tool: 'edit_file', ok: true, changed: true } as BuilderV2Receipt, run('npm test', true)]
  const acceptance = builderV2Acceptance(spec, files, production)
  assert.equal(acceptance.satisfied, false)
  assert.deepEqual(acceptance.pendingCommands, ['node --test test/*.test.js'])
  const complete = [...production, run('node --test test/*.test.js', true)]
  assert.equal(builderV2Acceptance(spec, files, complete).satisfied, true)
  assert.equal(builderAcceptanceLedger(spec, complete).passed, true, 'the job-level acceptance ledger agrees')
})

test('a missing deliverable or too few tests still blocks completion', () => {
  const trace = [...files.slice(0, 3).map(write), run('npm test', true), run('node --test test/*.test.js', true)]
  assert.deepEqual(builderV2Acceptance(spec, files.slice(0, 3), trace).missingFiles, ['test/calculator.test.js'])
  const few: BuilderV2Receipt = { ...run('npm test', true), output: { requestedCommand: 'npm test', exitCode: 0, timedOut: false, stdout: '# pass 4\n# fail 0' } }
  assert.equal(builderV2Acceptance(spec, files, [...files.map(write), few, { ...few, output: { ...(few.output as object), requestedCommand: 'node --test test/*.test.js' } }]).satisfied, false)
})

test('the new list forms stay narrow: prose about files or commands is not a checklist', () => {
  assert.deepEqual(builderTaskContract('Create a small app with the following files:\n- `a.js`\n- `b.js`\n\nThen describe them.').files, ['a.js', 'b.js'])
  assert.deepEqual(builderTaskContract('Execute:\n\n```bash\nnpm test\n```\n\nThat command must pass.').commands, ['npm test'])
  assert.deepEqual(builderTaskContract('I want to execute: npm test later').commands, [])
  assert.deepEqual(builderTaskContract('We discussed the following files: yesterday').files, [])
})
