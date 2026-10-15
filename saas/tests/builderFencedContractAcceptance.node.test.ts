import test from 'node:test'
import assert from 'node:assert/strict'
import { builderTaskContract, builderTaskProgress } from '../lib/builder/task-contract.ts'
import type { BuilderToolTrace } from '../lib/builder/contracts.ts'

const objective = `# OrderFlow
## Required files
Create all 15 files:
\`\`\`text
package.json
index.js
README.md
src/catalog.js
src/cart.js
src/orders.js
src/discounts.js
src/storage.js
src/errors.js
test/catalog.test.js
test/cart.test.js
test/orders.test.js
test/discounts.test.js
test/storage.test.js
test/integration.test.js
\`\`\`
## Required execution
Run these commands against the actual generated files:
\`\`\`bash
npm test
node --test test/*.test.js
node index.js
\`\`\`
`
const execution = (command: string): BuilderToolTrace => ({
 round: 1, toolId: 'run', input: { command }, ok: true,
 output: { exitCode: 0, timedOut: false, stdout: '# pass 30\n# fail 0\n', stderr: '' },
})
test('production fenced OrderFlow contract recognizes all 15 files and all three commands', () => {
 const contract = builderTaskContract(objective)
 assert.equal(contract.files.length, 15)
 assert.deepEqual(contract.commands, ['npm test','node --test test/*.test.js','node index.js'])
 assert.equal(builderTaskProgress(contract,contract.files.slice(0,11),[execution('npm test')]).satisfied,false)
 assert.deepEqual(builderTaskProgress(contract,contract.files.slice(0,11),[execution('npm test')]).missingFiles.length,4)
 assert.equal(builderTaskProgress(contract,contract.files,contract.commands.map(execution)).satisfied,true)
})
test('unrelated code fences are not interpreted as required project files', () => {
 const contract = builderTaskContract('Example:\n```text\nsecret.txt\n```')
 assert.deepEqual(contract.files,[])
})
