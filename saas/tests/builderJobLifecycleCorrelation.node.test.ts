import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')

test('durable Builder job records correlated claim and slice-finish receipts', () => {
  assert.match(source, /claimGeneration = job\.claimGeneration/)
  assert.match(source, /phase: 'claimed', jobId, claimGeneration, workspaceId: job\.workspaceId/)
  assert.match(source, /phase: 'slice_finished', jobId, claimGeneration, elapsedMs: Date\.now\(\) - executionStartedAt/)
  assert.match(source, /if \(claimGeneration !== null\) console\.info/)
  assert.doesNotMatch(source, /\[builder_job_lifecycle\][^\n]*objective/)
})
