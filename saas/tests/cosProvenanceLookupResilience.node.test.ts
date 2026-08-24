import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const STORE = readFileSync(new URL('../lib/ai/cos/supportTurnProvenance.ts', import.meta.url), 'utf8')
const WRAPPER = readFileSync(new URL('../app/api/support/route.ts', import.meta.url), 'utf8')

test('answers are compared on their common prefix, not by exact equality', () => {
  assert.match(STORE, /function sameAnswer\(storedContent: unknown, expectedContent: string\): boolean/)
  assert.match(STORE, /const width = Math\.min\(stored\.length, expected\.length\)/)
  assert.match(STORE, /stored\.slice\(0, width\) === expected\.slice\(0, width\)/)
})

test('a short answer still requires full equality, so brief replies are not confused', () => {
  assert.match(STORE, /const MIN_COMPARABLE_PREFIX = 200/)
  assert.match(STORE, /if \(width < MIN_COMPARABLE_PREFIX\) return stored === expected/)
})

test('every content-checked lookup uses the shared comparison', () => {
  const uses = STORE.split('sameAnswer(').length - 1
  assert.ok(uses >= 3, 'expected the definition plus both lookup call sites')
  assert.equal(STORE.includes('normalizeAssistantContent(item?.content) === expected'), false)
})

test('the unverified fallback is reachable after a failed match, not only when nothing to match', () => {
  assert.match(WRAPPER, /LAST RESORT, NOW REACHABLE/)
  assert.match(WRAPPER, /if \(!recorded\) \{\n      recorded = await latestUserTurnProvenance\(userId\)\n      verified = false\n    \}/)
  assert.equal(WRAPPER.includes('if (!recorded && !precedingAssistant) {'), false)
})

test('an unverified result is still labelled, never presented as a confirmed match', () => {
  assert.match(WRAPPER, /unverifiedProvenanceCaveat\(languageCode\)/)
  assert.match(WRAPPER, /provenance_match_verified: verified/)
})
