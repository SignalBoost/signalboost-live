// saas/tests/builderWorkBudget.node.test.ts
//
// Production 2026-10-14 (workspace f5cc46a5): the owner's OrderFlow build wrote 9 of its 15 required files, ran the tests
// (29/31 passing) and stopped at "work limit" after 4 work slices, with an empty checklist in its report. A job now keeps
// its first 4 slices and earns more, up to 12, only while each slice makes progress; a "continue" keeps the original
// checklist; and a stop reports how many required files exist and which are missing.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { builderContractObjective, builderTaskContract } from '../lib/builder/task-contract.ts'
import { MAX_WORK_SLICES } from '../lib/builder/work-budget.ts'

const ORDERFLOW = readFileSync(new URL('./fixtures/builder-orderflow-request.md', import.meta.url), 'utf8').replace(/^<!--.*-->\n/, '')
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

test('the database ceiling matches the code and the migration runs through the Hub (no BEGIN/COMMIT)', () => {
  assert.equal(MAX_WORK_SLICES, 24)
  const migration = readFileSync(new URL('../supabase/migrations/20261014130000_builder_auto_continue_productive_slices.sql', import.meta.url), 'utf8')
  assert.match(migration, /status = 'paused' and claim_generation < 24 and checkpoint is not null/)
  assert.match(migration, /claim_generation = p_generation and claim_generation < 24/)
  assert.doesNotMatch(migration, /^\s*(?:begin|commit)\s*;\s*$/im, 'hub_exec_sql cannot execute transaction commands')
  const store = readFileSync(new URL('../lib/builder/job-store.ts', import.meta.url), 'utf8')
  assert.match(store, /\.lt\('claim_generation', MAX_WORK_SLICES\)/)
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(runner, /claimGeneration < 4/)
})
// end of saas/tests/builderWorkBudget.node.test.ts (if this line is missing, the paste was cut short)

test('the bounded continuation-cycle migration requeues the same job and checkpoint', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261014153000_builder_continuation_cycles.sql', import.meta.url), 'utf8')
  assert.match(migration, /status = 'paused', claim_generation = 0, checkpoint = p_checkpoint/)
  assert.match(migration, /'continuationCycles',v_cycles \+ 1/)
  assert.match(migration, /v_cycles >= 2/)
  assert.match(migration, /90 minutes/)
  assert.match(migration, /p_checkpoint->>'workspaceId' is distinct from v_job.workspace_id::text/)
})

test('work limit never instructs the customer to type continue', () => {
  const source = readFileSync(new URL('../lib/builder/work-budget.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /Reply \\"continue\\" in this workspace/)
})
