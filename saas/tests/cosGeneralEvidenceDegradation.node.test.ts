import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerCore.ts', import.meta.url), 'utf8')

test('fresh sources are no longer discarded solely for missing authority consensus', () => {
  assert.match(source, /if \(!successfulResponses\.length \|\| !sources\.length\)/)
  assert.match(source, /const authorityComplete = freshEvidenceMeetsAuthority/)
})
test('partial evidence is bounded and explicitly labeled for the reasoner', () => {
  assert.match(source, /Evidence is partial or missing independent corroboration/)
  assert.match(source, /Partial evidence was overclaimed by synthesis/)
})
test('single question-specific election snapshot is not embedded in the core', () => {
  assert.doesNotMatch(source, /brazilRunoffRequest|duringVerifiedBrazilRunoff/)
})
