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

test('V2 uses existing generation-fenced pause and terminal outcome RPCs', () => {
  assert.match(source, /db\.rpc\('pause_builder_job_slice'/)
  assert.match(source, /p_generation: job\.claimGeneration/)
  assert.match(source, /status: success \? 'succeeded' : 'failed'/)
})
