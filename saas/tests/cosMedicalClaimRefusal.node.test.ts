import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ROUTE = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')

test('unsupported medical lifespan claims refuse and redirect before live evidence routing', () => {
  assert.match(ROUTE, /UNSUPPORTED_MEDICAL_LIFESPAN_CLAIM/)
  assert.match(ROUTE, /source: 'cos-safety-refusal'/)
  assert.ok(ROUTE.indexOf('UNSUPPORTED_MEDICAL_LIFESPAN_CLAIM.test(input)') < ROUTE.indexOf('requiresFreshExternalEvidence(input)'))
})
