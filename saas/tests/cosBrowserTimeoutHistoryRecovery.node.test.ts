import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/ai/cos/agentProgressClient.ts', import.meta.url), 'utf8')

test('Concierge timeout continues the existing read-only History watch', () => {
  const start = source.indexOf('if (boundedPublicTransport && responseSignal.aborted)')
  const end = source.indexOf('if (deliberateAbort(error, args.signal))', start)
  assert.ok(start >= 0 && end > start)
  const branch = source.slice(start, end)
  assert.match(branch, /const saved = historyWatchEligible \? await watched : null/)
  assert.doesNotMatch(branch, /recoverSavedTurnOnce\(/)
  assert.doesNotMatch(branch, /fetch\([^)]*method:\s*['"]POST/)
})
test('gateway timeout envelopes also receive bounded durable History recovery', () => {
  const start = source.indexOf('if (historyWatchEligible && transportFailed && !args.signal.aborted)')
  const end = source.indexOf('const turnId =', start)
  assert.ok(start >= 0 && end > start)
  const branch = source.slice(start, end)
  assert.match(branch, /await watchHistoryForCompletedTurn\(/)
  assert.match(branch, /signal: args.signal/)
})
test('no automatic POST retries introduced by the recovery repair', () => {
  const post = source.match(/const posted: Promise<TransportOutcome> = fetch\(endpoint,/g) || []
  assert.equal(post.length, 1)
  assert.match(source, /COS_HISTORY_WATCH_DEADLINE_MS = 240_000/)
})
