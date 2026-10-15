import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { builderTaskContract } from '../lib/builder/task-contract.ts'

test('automatic verification requires all explicitly named test files before running a partial suite', () => {
  const objective = [
    'Create all 4 files:',
    '```text',
    'src/orders.js',
    'test/catalog.test.js',
    'test/orders.test.js',
    'test/integration.test.js',
    '```',
    'Run these commands against the actual generated files:',
    '```bash',
    'npm test',
    '```',
  ].join('\n')
  const contract = builderTaskContract(objective)
  assert.equal(contract.files.length, 4)
  const requiredTests = contract.files.filter(path =>
    /(?:^|\/)(?:test|tests)\/|(?:\.test\.|\.spec\.)/i.test(path))
  assert.equal(requiredTests.length, 3)
  assert.equal(requiredTests.every(path => ['src/orders.js', 'test/catalog.test.js'].includes(path)), false)
  assert.equal(requiredTests.every(path => contract.files.includes(path)), true)
  const loop = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')
  assert.match(loop, /const requiredTestFilesReady = task\.files\.filter\(/)
  assert.match(loop, /partialTestProofReady = requiredImplementationReady && stagedTestsExist && requiredTestFilesReady/)
})
