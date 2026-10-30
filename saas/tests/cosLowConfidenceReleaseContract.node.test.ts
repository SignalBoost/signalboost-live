import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
const incident = readFileSync(new URL('./fixtures/cos-incident-analysis-brief.txt', import.meta.url), 'utf8')

test('COS final low-confidence fallback releases only a draft the reasoner verifier already let through', () => {
  assert.match(route, /function lowConfidenceDraftReply\(cos: [^\n]+, reason: \{ detail: string \}\): string \| null/)
  assert.doesNotMatch(route, /releasableAnalyticalAnswer/)
  assert.match(route, /lowConfidenceDraftReply\(cos,reason\)/)
})
