import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')

test('broad repository suite rejection installs deterministic narrow proof path', () => {
  assert.match(source, /const broadTestNarrowCommand = blockedBroadRun/)
  assert.match(source, /candidates.length === 1/)
  assert.match(source, /action: Action \| null = broadTestNarrowCommand/)
  assert.match(source, /toolId: 'run', input: \{ command: broadTestNarrowCommand \}/)
})
test('repeated list_files after blocked broad test terminates with original denial provenance', () => {
  assert.match(source, /builder_repeated_tool_call:list_files/)
  assert.match(source, /builder_regression_evidence_required: npm test blocked by builder_repository_broad_test_blocked; no unique named failing test/)
})
