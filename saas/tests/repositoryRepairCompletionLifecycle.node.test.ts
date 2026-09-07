import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const lifecycle = readFileSync(new URL('../lib/builder/repository-repair-job-lifecycle.ts', import.meta.url), 'utf8')
const mergeRoute = readFileSync(new URL('../app/api/cron/builder-repair-merge/route.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260907003000_builder_repository_merge_completion.sql', import.meta.url), 'utf8')

test('Platform Engineer success is database-gated on an actual PR merge', () => {
  assert.match(migration, /v_platform_repair and p_status = 'succeeded'/)
  assert.match(migration, /merge_taken'.*'true'/s)
  assert.match(migration, /merge_commit_sha/)
  assert.match(migration, /status = 'paused'/)
  assert.match(migration, /repository_merge_pending', true/)
  assert.match(migration, /builder_repository_merge_incomplete/)
})

test('Platform Engineer always preserves a builder-result.txt deliverable at terminalization', () => {
  assert.match(migration, /builder-result\.txt/)
  assert.match(migration, /insert into public\.builder_workspace_files/)
  assert.match(migration, /Builder files:/)
})

test('merge cron reconciles the originating paused Builder job only after a merged outcome', () => {
  assert.match(mergeRoute, /outcome\.outcome !== 'merged'/)
  assert.match(mergeRoute, /completeBuilderRepositoryRepairAfterMerge/)
  assert.match(lifecycle, /\.eq\('status', 'paused'\)/)
  assert.match(lifecycle, /repository_merge_pending: true/)
  assert.match(lifecycle, /status: 'succeeded'/)
  assert.match(lifecycle, /merge_taken: true/)
  assert.match(lifecycle, /builder-result\.txt/)
})
