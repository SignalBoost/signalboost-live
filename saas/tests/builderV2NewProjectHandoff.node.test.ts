import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isNewBuilderProjectObjective, selectBuilderProject } from '../lib/builder/project-continuity.ts'

const orderFlow = `# OrderFlow — End-to-End Builder Acceptance Test
## Objective
Build a complete, working OrderFlow application using Node.js and JavaScript.
Create package.json, src/catalog.js, test/catalog.test.js.
Preserve existing project files if appropriate. Execute npm test and node index.js.`

test('OrderFlow is a fresh build even when wording later mentions existing project files', async () => {
  assert.equal(isNewBuilderProjectObjective(orderFlow), true)
  const selected = await selectBuilderProject({
    objective: orderFlow,
    userId: 'd43c2298-f319-49eb-aec3-de5c10203ab4',
    conversationId: '7786bd78-88be-405e-94cb-c1fd9fb1c721',
    requestedWorkspaceId: '9cab6a10-f47d-4c53-93c8-82a9b0c8ff91',
    hasNewSource: false,
    repositoryImport: false,
  }, async () => { throw new Error('no history lookup for fresh build') })
  assert.deepEqual(selected, {})
})

test('explicit existing project repair still retains its selected workspace', async () => {
  assert.equal(isNewBuilderProjectObjective('Fix failing tests in the existing project'), false)
  const selected = await selectBuilderProject({
    objective: 'Fix failing tests in the existing project',
    userId: null, conversationId: null,
    requestedWorkspaceId: '9cab6a10-f47d-4c53-93c8-82a9b0c8ff91',
    hasNewSource: false, repositoryImport: false,
  }, async () => null)
  assert.equal(selected.workspaceId, '9cab6a10-f47d-4c53-93c8-82a9b0c8ff91')
})

test('V2 developer page does not post the restored workspace id for a fresh build', () => {
  const page = readFileSync(new URL('../app/dashboard/developer/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /workspaceId: isNewBuilderProjectObjective\(task\) \? undefined : workspaceId \|\| undefined/)
  assert.match(page, /!isNewBuilderProjectObjective\(task\) && \(!workspaceId/)
})
