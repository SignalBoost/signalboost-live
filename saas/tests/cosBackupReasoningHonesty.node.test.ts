import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const RUNTIME = readFileSync(new URL('../lib/cos-backup/runtime.ts', import.meta.url), 'utf8')

test('backup mode retains reasoning-honesty safeguards', () => {
  assert.match(RUNTIME, /const BACKUP_REASONING_RULES = \[/)
  assert.match(RUNTIME, /REASONING HONESTY \(applies in backup mode too\)/)
  const promptSites = RUNTIME.split('BACKUP COS MODE:').length - 1
  const ruleSites = RUNTIME.split('REASONING HONESTY (applies in backup mode too)').length - 1
  assert.equal(ruleSites, promptSites)
})

test('backup distinguishes request facts, legal uncertainty, and its own reading', () => {
  assert.match(RUNTIME, /write it in the first person/)
  assert.match(RUNTIME, /Do not name specific laws, regulations, standards or contractual obligations as applicable/)
  assert.match(RUNTIME, /unless the request established the jurisdiction, industry and circumstances/)
  assert.match(RUNTIME, /recommend qualified review/)
  assert.match(RUNTIME, /Do not state a specific calendar date, deadline or quarter that was not given/)
  assert.match(RUNTIME, /rewrite it to match what you actually concluded/)
})

test('backup retains read-only operational boundaries', () => {
  assert.match(RUNTIME, /You are read-only and advisory-only/)
  assert.match(RUNTIME, /Do not call or claim to call any tool/)
  assert.match(RUNTIME, /Do not claim any action was executed/)
})
