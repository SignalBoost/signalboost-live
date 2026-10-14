import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')
const cron = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
test('continuation interval is at most one minute', () => {
  const entry = cron.crons.find((item: { path: string }) => item.path === '/api/cron/builder-continuations')
  assert.equal(entry?.schedule, '* * * * *')
})
test('large resumed builds preserve scaffold and run tests before optional documentation', () => {
  assert.match(source, /RESUMED WORKSPACE: Inspect existing files first/)
  assert.match(source, /const requiredImplementationReady/)
  assert.match(source, /const stagedTestsExist/)
  assert.match(source, /const partialTestProofReady/)
  assert.match(source, /progress\.missingFiles\.length === 0 \|\| partialTestProofReady/)
  assert.match(source, /progress\.pendingCommands\.find/)
})
