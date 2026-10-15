import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../app/dashboard/developer/page.tsx', import.meta.url), 'utf8')
const explicitSavedProject = /^\s*(?:open|resume|continue|edit|modify|repair|debug|fix)\b[^\n]{0,120}\b(?:existing|current|saved|original)\s+(?:project|workspace|files?)\b/i

test('new OrderFlow application brief is not refused due to incidental existing-project wording', () => {
  const orderFlow = `# OrderFlow — End-to-End Builder Acceptance Test
Build a complete working Node.js application.
Create package.json, README.md, index.js, src/catalog.js, and test/catalog.test.js.
Save project files and preserve existing files where appropriate.
Run npm test, node --test test/*.test.js, and node index.js.`
  assert.equal(explicitSavedProject.test(orderFlow), false)
  assert.equal(explicitSavedProject.test('Open the original workspace to fix source files'), false)
  assert.equal(explicitSavedProject.test('Resume the existing workspace files'), true)
  assert.match(page, /setError\('The selected workspace has no source files/)
  assert.ok(page.includes(String.raw`/^\s*(?:open|resume|continue|edit|modify|repair|debug|fix)\b`))
})
