import assert from 'node:assert/strict'
import test from 'node:test'
import { builderTaskContract, builderTaskProgress } from '../lib/builder/task-contract.ts'

const objective = [
  '# OrderFlow — End-to-End Builder Acceptance Test',
  'Build a complete, working OrderFlow application using Node.js.',
  '## Required files',
  'Create all 15 files:',
  '```text',
  'package.json',
  'index.js',
  'README.md',
  'src/catalog.js',
  'src/cart.js',
  'src/orders.js',
  'src/discounts.js',
  'src/storage.js',
  'src/errors.js',
  'test/catalog.test.js',
  'test/cart.test.js',
  'test/orders.test.js',
  'test/discounts.test.js',
  'test/storage.test.js',
  'test/integration.test.js',
  '```',
  '## Required execution',
  'Run these commands against the actual generated files:',
  '```bash',
  'npm test',
  'node --test test/*.test.js',
  'node index.js',
  '```',
].join('\n')

test('OrderFlow Markdown task contract retains all 15 files and three commands', () => {
  const contract = builderTaskContract(objective)
  assert.equal(contract.files.length, 15)
  assert.deepEqual(contract.commands, ['npm test', 'node --test test/*.test.js', 'node index.js'])
})

test('24 passing tests cannot prove a 15-file contract with four missing files', () => {
  const contract = builderTaskContract(objective)
  const paths = contract.files.filter(path => ![
    'test/orders.test.js', 'test/discounts.test.js', 'test/storage.test.js', 'test/integration.test.js',
  ].includes(path))
  const trace = [{
    round: 1, toolId: 'run' as const, input: { command: 'npm test' }, ok: true,
    output: { exitCode: 0, stdout: 'ℹ tests 24\nℹ pass 24\nℹ fail 0', stderr: '', timedOut: false },
  }]
  const progress = builderTaskProgress(contract, paths, trace)
  assert.equal(progress.satisfied, false)
  assert.deepEqual(progress.missingFiles, [
    'test/orders.test.js', 'test/discounts.test.js', 'test/storage.test.js', 'test/integration.test.js',
  ])
  assert.deepEqual(progress.pendingCommands, ['node --test test/*.test.js', 'node index.js'])
})

test('non-file prose and markdown headings do not become deliverables', () => {
  const contract = builderTaskContract('Create all 2 files:\n```text\nfoo.js\nbar.js\n```\n## Notes\nDo not delete tests.')
  assert.deepEqual(contract.files, ['foo.js', 'bar.js'])
})
