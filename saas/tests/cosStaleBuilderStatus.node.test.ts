import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
test('restored Builder status is removed when durable job is gone', () => {
  assert.match(source, /response\.status === 404 \|\| response\.status === 410/)
  assert.match(source, /if \(!disposed\) \{\s*setLiveJob\(null\)\s*setLiveProgress\(null\)/)
  assert.match(source, /window\.localStorage\.removeItem\(LIVE_BUILDER_KEY\)/)
  assert.match(source, /observeOnly=true&jobId=/)
})
