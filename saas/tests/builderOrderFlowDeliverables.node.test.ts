import test from 'node:test'
import assert from 'node:assert/strict'
import { builderTaskContract, builderTaskProgress } from '../lib/builder/task-contract.ts'

const objective = `# COS Builder Advanced Stress Test — OrderFlow

## 3. Required project structure
Create at least these files:

- \`package.json\`
- \`src/catalog.js\`
- \`src/cart.js\`
- \`src/orders.js\`
- \`src/discounts.js\`
- \`src/storage.js\`
- \`src/errors.js\`
- \`index.js\`
- \`test/catalog.test.js\`
- \`test/cart.test.js\`
- \`test/orders.test.js\`
- \`test/discounts.test.js\`
- \`test/storage.test.js\`
- \`test/integration.test.js\`
- \`README.md\`

## 4. Testing requirements
Write at least 30 independent automated tests.

## 5. Verification
Execute these commands in the Builder workspace:

\`node --test test/*.test.js\`
\`node index.js\`
`

test('OrderFlow stress test pins all fifteen output files and both execution proofs', () => {
  const contract = builderTaskContract(objective)
  assert.equal(contract.files.length, 15)
  assert.ok(contract.files.includes('index.js'))
  assert.ok(contract.files.includes('test/integration.test.js'))
  assert.ok(contract.commands.includes('node --test test/*.test.js'))
  assert.ok(contract.commands.includes('node index.js'))
  assert.equal(contract.minimumTests, 30)
  const partial = builderTaskProgress(contract, ['package.json', 'src/cart.js', 'src/catalog.js', 'test/cart.test.js', 'test/catalog.test.js'], [])
  assert.ok(partial.missingFiles.includes('src/orders.js'))
  assert.ok(partial.missingFiles.includes('README.md'))
  assert.equal(partial.satisfied, false)
})

test('production 2026-10-16: the OrderFlow tree and verification block become the full checklist', async () => {
  const { builderTaskContract: contractOf } = await import('../lib/builder/task-contract.ts')
  const objective = [
    '# OrderFlow — End-to-End Builder Acceptance Test',
    '## 2. Required project structure',
    'Create all 15 files:',
    '```text',
    'orderflow/',
    '├── package.json',
    '├── README.md',
    '├── index.js',
    '├── src/',
    '│   ├── catalog.js',
    '│   └── errors.js',
    '├── test/',
    '│   ├── catalog.test.js',
    '│   └── checkout.test.js',
    '```',
    'Use Node.js built-in testing tools.',
    '## 3. Automated tests',
    'Implement at least **20 meaningful automated tests**, covering:',
    '## 4. Mandatory verification',
    'Execute all three commands:',
    '```bash',
    'npm test',
    'node --test test/*.test.js',
    'node index.js',
    '```',
    'Record the actual exit code and relevant stdout/stderr for each command.',
  ].join('\n')
  const contract = contractOf(objective)
  assert.deepEqual(contract.files, ['package.json', 'README.md', 'index.js', 'src/catalog.js', 'src/errors.js', 'test/catalog.test.js', 'test/checkout.test.js'])
  assert.deepEqual(contract.commands, ['npm test', 'node --test test/*.test.js', 'node index.js'])
  assert.equal(contract.minimumTests, 20)
})

test('a passing npm test does not complete a build that is still missing a drawn-tree deliverable', async () => {
  const { builderTaskContract: contractOf, builderTaskProgress } = await import('../lib/builder/task-contract.ts')
  const contract = contractOf(['## Project structure', '```text', 'app/', '├── index.js', '└── test/', '    └── a.test.js', '```', '## Mandatory verification', '```bash', 'npm test', 'node index.js', '```'].join('\n'))
  assert.deepEqual(contract.files, ['index.js', 'test/a.test.js'])
  const trace = [
    { round: 1, toolId: 'write_file', ok: true, input: { path: 'test/a.test.js' } },
    { round: 2, toolId: 'run', ok: true, input: { command: 'npm test' }, output: { exitCode: 0, stdout: 'ℹ pass 1\nℹ fail 0' } },
  ] as any
  const progress = builderTaskProgress(contract, ['test/a.test.js'], trace)
  assert.equal(progress.satisfied, false)
  assert.deepEqual(progress.missingFiles, ['index.js'])
  assert.deepEqual(progress.pendingCommands, ['node index.js'])
})
