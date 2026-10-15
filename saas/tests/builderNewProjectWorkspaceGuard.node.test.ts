import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../app/dashboard/developer/page.tsx', import.meta.url), 'utf8')

test('new application requests are not blocked by incidental existing-project language', () => {
  const gate = /^\s*(?:open|resume|continue|edit|modify|repair|debug|fix)\b[^\n]{0,120}\b(?:existing|current|saved|original)\s+(?:project|workspace|files?)\b/i
  const request = `# OrderFlow — End-to-End Builder Acceptance Test
Build a complete working application using Node.js and JavaScript.
Create package.json, src/catalog.js and at least 20 tests.
Preserve existing project behavior if applicable.
Run npm test, node --test test/*.test.js and node index.js.`
  assert.equal(gate.test(request), false)
  assert.equal(gate.test('Resume the existing workspace with the saved files'), true)
  assert.match(page, /setError\('The selected workspace has no source files/)
  assert.match(page, /\(\?:open\|resume\|continue\|edit\|modify\|repair\|debug\|fix\)/)
})
