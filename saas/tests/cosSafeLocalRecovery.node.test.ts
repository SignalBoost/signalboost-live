import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')

test('safe search miss keeps normal COS completion and recovery available', () => {
  assert.match(source, /if\(!freshSources\.length && !mustFailClosedWithoutAuthoritativeLiveEvidence\(lookupInput\)\)/)
  assert.match(source, /freshMissUseLocal=true/)
  assert.match(source, /if\(!requestedAction&&\(!requiresFreshEvidence\|\|freshMissUseLocal\)\)\{/)
  assert.equal(source.split('!requestedAction&&(!requiresFreshEvidence||freshMissUseLocal)').length - 1, 4)
})

test('current authoritative claims still fail closed without live evidence', () => {
  assert.match(source, /mustFailClosedWithoutAuthoritativeLiveEvidence\(lookupInput\)/)
  assert.match(source, /source:'cos-fresh-evidence-unavailable'/)
  assert.match(source, /const freshHardFail=requiresFreshEvidence&&!freshMissUseLocal/)
})
