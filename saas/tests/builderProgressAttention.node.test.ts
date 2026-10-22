import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
const fn = source.slice(source.indexOf('export function builderProgressSnapshot'), source.indexOf('function runningReply'))

test('Builder V2 progress parses real Node TAP totals instead of literal backslash tokens', () => {
  assert.match(fn, /const passCount = Number/)
  assert.ok(fn.includes(String.raw`/(?:^|\n)\s*(?:#|ℹ)\s+pass\s+(\d+)/`))
  assert.ok(fn.includes(String.raw`/(?:^|\n)\s*(?:#|ℹ)\s+fail\s+(\d+)/`))
  assert.equal(/(?:^|\n)\s*(?:#|ℹ)\s+pass\s+(\d+)/.exec('ℹ tests 13\nℹ pass 13\nℹ fail 0')[1], '13')
})
test('stall indicator reflects durable activity, not invented progress', () => {
 assert.match(fn, /activityAgeSeconds: ageSeconds/)
 assert.match(fn, /needsAttention/)
 assert.match(fn, /ageSeconds >= 120/)
 assert.match(fn, /!capacityWait/)
 assert.match(fn, /attentionReason:/)
 assert.doesNotMatch(fn, /return steps|return checkpoint/)
})
