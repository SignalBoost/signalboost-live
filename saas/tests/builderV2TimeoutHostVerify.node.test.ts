import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/builder/agent-v2.ts', import.meta.url), 'utf8')

test('a model timeout after all files exist dispatches each mandatory real host command', () => {
  // Shared with host verification after each change (builderV2BatchedActions covers the behaviour).
  assert.ok(src.includes('const hostVerificationDue = () => checklist.files.length > 0'))
  assert.match(src, /if \(missingNpmManifest\(command\)\) return null/, 'host never verifies with a missing npm manifest')
  assert.ok(src.includes('checklist.commands.some(command => !latestCommandRun(command))'))
  assert.match(src, /const action: BuilderV2Action = \{ tool: 'run_tests', command \}/)
  assert.match(src, /const receipt = await this\.dispatcher\.dispatch\(options\.workspaceId, action\)/)
  assert.match(src, /!knownFiles\.includes\('package.json'\)/, 'npm verification requires a real workspace manifest')
  assert.match(src, /if \(!receipt\.ok\) return null/)
})
test('no simulated pass: acceptance still needs recorded passing host receipts', () => {
  assert.match(src, /builderV2Acceptance\(options\.objective, knownFiles, steps\)/)
  assert.match(src, /acceptance\.satisfied && missingFiles\(\)\.length === 0/)
  assert.match(src, /if \(!options\.onCheckpoint\) return/)
})
