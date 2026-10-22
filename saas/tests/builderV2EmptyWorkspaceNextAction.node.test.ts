import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('Builder does not recommend npm test in a workspace without package.json', () => {
  const source = readFileSync(new URL('../lib/builder/agent-v2.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /checklist\.commands\[0\] \?\? 'npm test'/)
  assert.match(source, /knownFiles\.includes\('package\.json'\)/)
  assert.match(source, /No runnable verification command exists for the current workspace/)
  assert.match(source, /do not repeat list_files/)
})
