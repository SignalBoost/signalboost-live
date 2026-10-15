import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('Builder schedules verification for successful writes restored from an earlier execution slice', () => {
  const loop = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')
  assert.match(loop, /const verificationCommand = chunks\.size === 0 && !repairObjective && \(writeCount > 0 \|\| trace\.some\(item => item\.ok && \(item\.toolId === 'write_file' \|\| item\.toolId === 'edit_file'\)\)\)/)
  assert.match(loop, /progress\.pendingCommands\.find\(command/)
  assert.match(loop, /\? \{ type: 'tool', toolId: 'run', input: \{ command: verificationCommand \} \}/)
})
