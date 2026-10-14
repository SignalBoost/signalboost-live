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
