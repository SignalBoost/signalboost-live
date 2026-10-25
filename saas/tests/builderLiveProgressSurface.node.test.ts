import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')

test('Builder live status reads durable server-side progress, not just a generic reply', () => {
  assert.match(source, /observeOnly=true&jobId=/)
  assert.match(source, /setLiveProgress\(result\.progress/)
  assert.match(source, /aria-label="Builder live progress"/)
  for (const field of ['phase', 'workRounds', 'filesWritten', 'modelCalls', 'activityAgeSeconds', 'lastTest']) {
    assert.ok(source.includes('liveProgress.' + field), field)
  }
})

test('Builder progress exposes inactivity warning and maintains server-backed Stop', () => {
  assert.match(source, /liveProgress\.needsAttention === true/)
  assert.match(source, /aria-label="Stop Builder job"/)
  assert.match(source, /method: 'DELETE'/)
})
