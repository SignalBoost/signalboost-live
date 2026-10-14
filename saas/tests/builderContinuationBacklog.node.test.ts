import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/api/cron/builder-continuations/route.ts', import.meta.url), 'utf8')

test('control plane reports the durable backlog without treating queued jobs as completed', () => {
  assert.match(source, /pendingContinuationCount/)
  assert.match(source, /\[builder\.continuation\.backlog\]/)
  assert.match(source, /pendingCheckpointedJobs: backlogError \? null : pendingContinuationCount/)
  assert.match(source, /\.eq\('status', 'paused'\)/)
  assert.match(source, /\.not\('checkpoint', 'is', null\)/)
  assert.match(source, /const selected = jobs\[0\] \|\| null/)
})
