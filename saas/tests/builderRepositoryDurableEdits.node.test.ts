import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../lib/builder/repository-repair.ts', import.meta.url), 'utf8')

test('repository repair persists each completed edit before a later model timeout', () => {
  assert.match(source, /const durableSession = new Proxy\(session, \{/)
  assert.match(source, /key === 'writeFile' \|\| key === 'editFile'/)
  assert.match(source, /await workspace\.writeFile\(input\.workspaceId, `repository\/\$\{result\.path\}`, result\.content\)/)
  assert.match(source, /proofController\?\.workspace \?\? durableSession/)
  assert.match(source, /workspace: durableSession/)
  assert.match(source, /if \(result\.ok === false && result\.error === BUILDER_TURN_TIMEOUT_ERROR\)/)
})
