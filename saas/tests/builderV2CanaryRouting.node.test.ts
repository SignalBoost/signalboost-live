import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')

test('V2 canary requires explicit owner authorization and engine opt-in', () => {
  assert.match(source, /job\.ownerAuthorized === true && job\.jobKind === 'standard'/)
  assert.match(source, /job\.metadata\.builderEngine === 'v2'/)
  assert.match(source, /createBuilderV2SupabaseLeaseStore\(db, job\.userId\)/)
  assert.match(source, /runBuilderV2JobCycle/)
})

test('V2 pauses through its own generation-fenced pause and finishes through the terminal outcome RPC', () => {
  // pause_builder_job_slice accepts only version-1 checkpoints; V2 pausing through it always failed (2026-10-16).
  const v2 = source.slice(source.indexOf("job.metadata.builderEngine === 'v2'"), source.indexOf('runBuilderPlaywrightCliCanary(job)'))
  assert.doesNotMatch(v2, /pause_builder_job_slice/)
  assert.match(v2, /pauseBuilderV2Job\(db, \{\s*jobId: job\.id, userId: job\.userId, claimGeneration: job\.claimGeneration/)
  assert.match(v2, /status: success \? 'succeeded' : 'failed'/)
  assert.match(v2, /cycle\.status === 'paused' \? 'builder_continuation_budget_exhausted' : cycle\.reason/)
})
