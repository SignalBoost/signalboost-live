import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ROUTE = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')

test('medical lifespan copy is constrained before freshness routing', () => {
  assert.match(ROUTE, /CONTENT_GENERATION_INTENT\.test\(input\) && REGULATED_MEDICAL_CLAIM\.test\(input\)/)
  assert.match(ROUTE, /source: 'cos-regulated-claims-guard'/)
  assert.match(ROUTE, /I cannot substantiate a claim that a medical device increases lifespan/)
  assert.ok(ROUTE.indexOf('REGULATED_MEDICAL_CLAIM.test(input)') < ROUTE.indexOf('requiresFreshExternalEvidence(input)'))
})
