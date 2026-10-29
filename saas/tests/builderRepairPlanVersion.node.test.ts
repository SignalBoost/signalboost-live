import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('repair replan keeps original customer objective and embeds versioned execution plan at admission', () => {
  const repair = readFileSync('lib/builder/repository-repair-job.ts', 'utf8')
  assert.match(repair, /const objective = input\.objective/)
  assert.match(repair, /repairExecutionObjective: executionObjective, repairPlanVersion: 2/)
  assert.doesNotMatch(repair, /advanceBuilderRepairPlanVersion/)
})

test('database initializes replanned task version in the same transaction as insertion', () => {
  const migration = readFileSync('supabase/migrations/20261029233500_builder_repair_plan_atomic_admission.sql', 'utf8')
  assert.match(migration, /before insert on public\.builder_jobs/i)
  assert.match(migration, /new\.plan_version := 2/)
  assert.match(migration, /new\.metadata->>'repairExecutionObjective'/)
  assert.match(migration, /new\.metadata->>'repairPlanVersion' is distinct from '2'/)
})
