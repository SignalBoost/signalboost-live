import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/20261029190000_builder_task_objective_guard.sql', import.meta.url), 'utf8')

test('canonical task record keeps the existing builder_jobs table and monotonic plan revision', () => {
  assert.match(migration, /alter table public\.builder_jobs\s+add column if not exists plan_version bigint not null default 1/i)
  assert.match(migration, /check \(plan_version >= 1\)/)
  assert.match(migration, /new\.plan_version < old\.plan_version/)
})

test('database refuses original-objective and tenant/execution identity rewrites', () => {
  for (const field of ['objective', 'user_id', 'conversation_id', 'workspace_id', 'job_kind']) {
    assert.match(migration, new RegExp('new\\.' + field + '\\s+is distinct from old\\.' + field))
  }
  assert.match(migration, /before update on public\.builder_jobs/)
  assert.match(migration, /for each row\s+execute function public\.guard_builder_job_immutable_objective\(\)/)
})

test.todo('staging PostgreSQL: reject updating original objective after task admission')
test.todo('staging PostgreSQL: checkpoint and claim updates remain allowed; reject tenant identity change')
test.todo('staging PostgreSQL: replan advances plan version without changing original objective or grants')
