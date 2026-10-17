import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/builder/agent-v2.ts', import.meta.url), 'utf8')

test('Builder V2 refuses repeat failed suites until a source revision changes', () => {
  assert.match(source, /builder_v2_unchanged_failed_suite/)
  assert.match(source, /steps\.slice\(steps\.findLastIndex\(step => step\.changed\) \+ 1\)/)
  assert.match(source, /requestedCommand === action\.command/)
  assert.match(source, /if \(\+\+repeats >= REPEAT_LIMIT\)/)
})

test('after test failure next recommended action is a repair, not another run', () => {
  assert.match(source, /\{ tool: 'edit_file', reason: 'Repair the last failing test before rerunning the unchanged revision' \}/)
  assert.match(source, /if \(hostVerificationDue\(\)\)/)
})

test('continuation restores latest failing host test and inspections across slices', () => {
  assert.match(source, /const currentFailure = \(\) =>/)
  assert.match(source, /latestFailedTest: currentFailure\(\)/)
  assert.match(source, /const currentRevisionRuns = \(\) => steps\.slice\(steps\.findLastIndex\(step => step\.changed\) \+ 1\)/)
  assert.match(source, /receipt\.tool === 'read_file' && receipt\.ok/)
  assert.match(source, /The host has already run the suite on this unchanged revision/)
})
