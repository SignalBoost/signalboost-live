// saas/tests/builderPlatformRepairNotFenced.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
const fence = runner.indexOf("terminalFailure(job, 'builder_v1_retired_use_v2')")
const v2Entry = runner.indexOf("job.jobKind === 'standard' && job.metadata.builderEngine === 'v2'")
const repairLane = runner.indexOf('await executeSignalBoostRepositoryRepair(')

test('the retired-V1 fence comes after every live lane, and the repair lane no longer reaches the V1 tool loop', () => {
  // Production 2026-10-17 (46 jobs, 15:15-17:22): website-optimizer, audit-findings and University repair
  // jobs carry platformRepair: true and no builderEngine tag, and every one died at the fence untouched.
  assert.ok(v2Entry > 0 && repairLane > 0 && fence > 0)
  assert.ok(v2Entry < repairLane, 'V2 jobs are selected before the repair lane')
  assert.ok(repairLane < fence, 'the repair lane runs before the fence')
  assert.doesNotMatch(runner, /BuilderToolLoop/)
  const repair = readFileSync(new URL('../lib/builder/repository-repair.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(repair, /BuilderToolLoop/)
  assert.match(repair, /new BuilderV2Agent\(/)
  assert.match(repair, /runBuilderV2JobCycle\(/)
})

test('repair jobs are enqueued the way production records them: platformRepair without an engine tag', () => {
  const enqueue = readFileSync(new URL('../lib/builder/repository-repair-job.ts', import.meta.url), 'utf8')
  assert.match(enqueue, /platformRepair: true,/)
  assert.doesNotMatch(enqueue, /builderEngine/)
})
