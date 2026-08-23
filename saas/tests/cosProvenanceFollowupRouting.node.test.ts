import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ROUTE = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')

test('provenance introspection is routed to the prior-turn handler before freshness classification', () => {
  assert.match(ROUTE, /if \(isProvenanceIntrospection\(input\) \|\| asksWhereTheAnswerCameFrom\(input\)\) return basePost\(new NextRequest\(req\.clone\(\)\)\)/)
  assert.ok(ROUTE.indexOf('isProvenanceIntrospection(input)') < ROUTE.indexOf('requiresFreshExternalEvidence(input)'))
})
