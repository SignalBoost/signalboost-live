import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/builder/agent-v2.ts', import.meta.url), 'utf8')
test('V2 detects list-files repetition across persisted continuation receipts', () => {
  assert.match(source, /steps\.slice\(steps\.findLastIndex\(item => item\.changed\) \+ 1\)/)
  assert.match(source, /sinceChange\.set\(JSON\.stringify\(\{ tool: 'list_files' \}\)/)
})
test('V2 supplies the missing-file checklist and updates it after writes', () => {
  assert.match(source, /missingRequiredFiles: missingFiles\(\)/)
  assert.match(source, /nextRecommendedAction: missingFiles\(\)\.length/)
  assert.match(source, /knownFiles\.push\(action\.path\)/)
})
