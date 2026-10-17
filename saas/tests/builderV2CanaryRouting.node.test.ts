import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')

// Since f6094f0 V2 is the default for fresh workspaces and open to customers: the runner selects it by the
// durable job tag alone, for standard jobs; legacy untagged jobs stay on V1.
test('the runner selects V2 by the durable engine tag on standard jobs', () => {
  assert.match(source, /if \(job\.jobKind === 'standard'\) \{/)
  assert.doesNotMatch(source, /job\.ownerAuthorized === true && job\.jobKind === 'standard' && job\.metadata\.builderEngine/)
  assert.match(source, /createBuilderV2SupabaseLeaseStore\(db, job\.userId\)/)
  assert.match(source, /runBuilderV2JobCycle/)
})

test('V2 uses existing generation-fenced pause and terminal outcome RPCs', () => {
  assert.match(source, /db\.rpc\('pause_builder_job_slice'/)
  assert.match(source, /p_generation: job\.claimGeneration/)
  assert.match(source, /status: success \? 'succeeded' : 'failed'/)
})

test('a V2 pause refused at the slice cap finishes as budget exhausted, not a persistence error', () => {
  const v2 = source.slice(source.indexOf("if (job.jobKind === 'standard')"), source.indexOf('runBuilderPlaywrightCliCanary(job)'))
  assert.match(v2, /if \(data === true\) return\s+\/\/[^\n]*\n\s+if \(job\.claimGeneration < MAX_WORK_SLICES\) return/)
  assert.match(v2, /cycle\.status === 'paused' \? 'builder_continuation_budget_exhausted' : cycle\.reason/)
})
