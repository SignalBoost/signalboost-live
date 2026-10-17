import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/builder/agent-v2.ts', import.meta.url), 'utf8')

test('Builder V2 recommends a bounded batch of missing files rather than one file per model call', () => {
  assert.match(source, /nextRecommendedAction: missingFiles\(\)\.length \? \{ tool: 'tools'/)
  assert.match(source, /missingFiles\(\)\.slice\(0, 4\)\.map\(path => \(\{ tool: 'write_file', path \}\)\)/)
  assert.match(source, /Generate these files together in one complete tools reply/)
  // The host still runs checklist verification; a batch is never proof of success.
  assert.match(source, /if \(hostVerificationDue\(\)\)/)
})
