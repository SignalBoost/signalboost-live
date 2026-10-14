// saas/tests/builderWorkBudget.node.test.ts
//
// Production 2026-10-14 (workspace f5cc46a5): the owner's OrderFlow build wrote 9 of its 15 required files, ran the tests
// (29/31 passing) and stopped at "work limit" after 4 work slices, with an empty checklist in its report. A job now keeps
// its first 4 slices and earns more, up to 12, only while each slice makes progress; a "continue" keeps the original
// checklist; and a stop reports how many required files exist and which are missing.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { BuilderLoopCheckpoint } from '../lib/builder/checkpoint.ts'
import { builderContractObjective, builderTaskContract } from '../lib/builder/task-contract.ts'
import { BASE_WORK_SLICES, MAX_WORK_SLICES, builderMayContinue, builderSliceMadeProgress, builderWorkLimitReport } from '../lib/builder/work-budget.ts'

const ORDERFLOW = readFileSync(new URL('./fixtures/builder-orderflow-request.md', import.meta.url), 'utf8').replace(/^<!--.*-->\n/, '')
// The files the production run had written when it stopped.
const WRITTEN = ['package.json', 'src/cart.js', 'src/catalog.js', 'src/discounts.js', 'src/errors.js', 'src/orders.js', 'src/storage.js', 'test/cart.test.js', 'test/catalog.test.js']

type Step = BuilderLoopCheckpoint['trace'][number]
const write = (path: string): Step => ({ round: 1, toolId: 'write_file', input: { path }, ok: true })
const run = (pass: number, fail: number): Step => ({ round: 1, toolId: 'run', input: { command: 'node --test test/*.test.js' }, ok: fail === 0,
  output: { exitCode: fail ? 1 : 0, stdout: `ℹ tests ${pass + fail}\nℹ pass ${pass}\nℹ fail ${fail}\n`, stderr: '', timedOut: false } })
const failedRead = (path: string): Step => ({ round: 1, toolId: 'read_file', input: { path }, ok: false, error: 'builder_repeated_tool_call:read_file' })
const checkpoint = (trace: Step[]) => ({ version: 1, trace } as unknown as BuilderLoopCheckpoint)

test("the OrderFlow request yields its full checklist: 15 files, both commands, 30 tests", () => {
  const contract = builderTaskContract(ORDERFLOW)
  assert.equal(contract.files.length, 15)
  assert.ok(contract.files.includes('index.js') && contract.files.includes('test/integration.test.js') && contract.files.includes('README.md'))
  assert.deepEqual(contract.commands, ['node --test test/*.test.js', 'node index.js'])
  assert.equal(contract.minimumTests, 30)
})

test('"continue" in the same project keeps the original checklist', () => {
  const context = { previousObjective: ORDERFLOW }
  assert.equal(builderTaskContract(builderContractObjective('continue', context)).files.length, 15)
  assert.equal(builderTaskContract(builderContractObjective('Please continue', context)).minimumTests, 30)
  assert.equal(builderContractObjective('Add a logout button', context), 'Add a logout button', 'only a continue inherits the checklist')
  assert.equal(builderContractObjective('continue'), 'continue')
})

test('a slice made progress only when it saved a file or raised the passing-test count', () => {
  const before = [write('a.js'), run(29, 2)]
  assert.equal(builderSliceMadeProgress(checkpoint(before), checkpoint([...before, write('b.js')])), true)
  assert.equal(builderSliceMadeProgress(checkpoint(before), checkpoint([...before, run(31, 0)])), true)
  assert.equal(builderSliceMadeProgress(checkpoint(before), checkpoint([...before, run(29, 2)])), false, 'the same result again is not progress')
  assert.equal(builderSliceMadeProgress(checkpoint(before), checkpoint([...before, run(12, 19)])), false)
  assert.equal(builderSliceMadeProgress(checkpoint(before), checkpoint([...before, failedRead('a.js'), failedRead('a.js')])), false)
  assert.equal(builderSliceMadeProgress(null, checkpoint([write('a.js')])), true)
})

test('every job keeps its first 4 slices; slices 5-24 must each make progress; 24 is the ceiling', () => {
  const progressed = checkpoint([write('a.js'), write('b.js')])
  const stalled = checkpoint([write('a.js'), failedRead('a.js')])
  const previous = checkpoint([write('a.js')])
  assert.equal(BASE_WORK_SLICES, 4)
  assert.equal(MAX_WORK_SLICES, 24)
  assert.equal(builderMayContinue({ claimGeneration: 2, checkpoint: previous, metadata: {} }, stalled), true, 'the first slices are unconditional')
  assert.equal(builderMayContinue({ claimGeneration: 5, checkpoint: previous, metadata: {} }, progressed), true)
  assert.equal(builderMayContinue({ claimGeneration: 23, checkpoint: previous, metadata: {} }, progressed), true)
  assert.equal(builderMayContinue({ claimGeneration: 5, checkpoint: previous, metadata: {} }, stalled), false, 'a stuck job still stops')
  assert.equal(builderMayContinue({ claimGeneration: 24, checkpoint: previous, metadata: {} }, progressed), false)
})

test('waiting for the model never spends the free slices or ends a job (production jobs 3df9cd5b, 031432d4, 63cc435e, 50f71674)', () => {
  const previous = checkpoint([write('a.js')])
  const waited = checkpoint([write('a.js')]) // the slice ended still waiting for the GPU: nothing new saved
  const requeued3 = { builderCapacityDeferrals: 3 }
  // Production: 5-6 claims, 3 of them capacity re-queues -> only 2-3 work slices had run.
  assert.equal(builderMayContinue({ claimGeneration: 5, checkpoint: previous, metadata: requeued3 }, waited), true, '2 work slices: still free')
  assert.equal(builderMayContinue({ claimGeneration: 6, checkpoint: previous, metadata: requeued3 }, waited), true, '3 work slices: still free')
  // Past the free slices, a slice that ended waiting for the model is not a verdict on the job.
  assert.equal(builderMayContinue({ claimGeneration: 9, checkpoint: previous, metadata: requeued3 }, waited, true), true)
  // A real stall (no wait, no progress) past the free slices still stops; the ceiling still holds.
  assert.equal(builderMayContinue({ claimGeneration: 9, checkpoint: previous, metadata: requeued3 }, waited, false), false)
  assert.equal(builderMayContinue({ claimGeneration: MAX_WORK_SLICES, checkpoint: previous, metadata: requeued3 }, waited, true), false)
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(runner, /builderMayContinue\(job, result\.checkpoint,\s*result\.error === 'builder_runpod_primary_busy' \|\| result\.error === 'builder_model_round_timeout'\)/)
})

test('a stop reports how many required files exist and which are missing', () => {
  const report = builderWorkLimitReport({ objective: ORDERFLOW, metadata: {} }, WRITTEN)
  assert.match(report, /^9 of 15 required files are written\./)
  for (const missing of ['index.js', 'README.md', 'test/orders.test.js', 'test/discounts.test.js', 'test/storage.test.js', 'test/integration.test.js']) {
    assert.ok(report.includes(missing), missing)
  }
  assert.match(report, /Reply "continue"/)
  assert.equal(builderWorkLimitReport({ objective: 'Fix the login bug', metadata: {} }, WRITTEN), '', 'no checklist, no file count')
})

test('the database ceiling matches the code and the migration runs through the Hub (no BEGIN/COMMIT)', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261014130000_builder_auto_continue_productive_slices.sql', import.meta.url), 'utf8')
  assert.match(migration, /status = 'paused' and claim_generation < 24 and checkpoint is not null/)
  assert.match(migration, /claim_generation = p_generation and claim_generation < 24/)
  assert.doesNotMatch(migration, /^\s*(?:begin|commit)\s*;\s*$/im, 'hub_exec_sql cannot execute transaction commands')
  const store = readFileSync(new URL('../lib/builder/job-store.ts', import.meta.url), 'utf8')
  assert.match(store, /\.lt\('claim_generation', MAX_WORK_SLICES\)/)
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(runner, /result\.checkpoint && builderMayContinue\(job, result\.checkpoint,/)
  assert.doesNotMatch(runner, /claimGeneration < 4/)
})
// end of saas/tests/builderWorkBudget.node.test.ts (if this line is missing, the paste was cut short)

test('productive work at slice ceiling requeues same job and checkpoint through bounded database cycle', () => {
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  const store = readFileSync(new URL('../lib/builder/job-store.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/20261014153000_builder_continuation_cycles.sql', import.meta.url), 'utf8')
  assert.match(runner, /builderSliceMadeProgress\(job\.checkpoint, result\.checkpoint\)/)
  assert.match(runner, /requeueBuilderContinuationCycle/)
  assert.match(store, /requeue_builder_continuation_cycle/)
  assert.match(migration, /status = 'paused', claim_generation = 0, checkpoint = p_checkpoint/)
  assert.match(migration, /'continuationCycles',v_cycles \+ 1/)
  assert.match(migration, /v_cycles >= 2/)
  assert.match(migration, /90 minutes/)
  assert.match(migration, /p_checkpoint->>'workspaceId' is distinct from v_job.workspace_id::text/)
})

test('model capacity timeout at final claim cycles instead of exhausting job', () => {
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(runner, /job\.claimGeneration >= 24[\s\S]*result\.error === 'builder_model_round_timeout'/)
  assert.match(runner, /requeueBuilderContinuationCycle/)
})
