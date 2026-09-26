import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const lifecycle = readFileSync(new URL('../lib/builder/repository-repair-job-lifecycle.ts', import.meta.url), 'utf8')
const mergeRoute = readFileSync(new URL('../app/api/cron/builder-repair-merge/route.ts', import.meta.url), 'utf8')
const mergeWatchRoute = readFileSync(new URL('../app/api/cron/builder-merge-watch/route.ts', import.meta.url), 'utf8')
const repair = readFileSync(new URL('../lib/builder/repository-repair.ts', import.meta.url), 'utf8')
const productionAcceptance = readFileSync(new URL('../lib/builder/repository-production-acceptance.ts', import.meta.url), 'utf8')
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
  assert.match(mergeRoute, /outcome\.outcome === 'merged' && outcome\.mergeCommitSha/)
  assert.match(mergeRoute, /completeBuilderRepositoryRepairAfterMerge/)
  assert.match(mergeRoute, /mergeWatchOutcome: outcome\.mergeWatchOutcome/)
  assert.match(lifecycle, /\.eq\('status', 'paused'\)/)
  assert.match(lifecycle, /repository_merge_pending: true/)
  assert.match(lifecycle, /status: 'succeeded'/)
  assert.match(lifecycle, /merge_taken: true/)
  assert.match(lifecycle, /builder-result\.txt/)
  assert.match(lifecycle, /input\.baseBranch === 'main' && input\.mergeWatchOutcome === 'healthy'/)
  assert.match(lifecycle, /input\.mergeWatchOutcome === 'rolled_back' \? 'failure' : 'observed'/)
})


test('main-branch Builder repair cannot claim success before live Playwright Production acceptance', () => {
  assert.match(repair, /repository_merge_pending: Boolean/)
  assert.match(repair, /production_acceptance_required/)
  assert.match(lifecycle, /productionAcceptancePassed !== true/)
  assert.match(lifecycle, /A READY Vercel deployment is not end-to-end proof/)
  assert.match(mergeRoute, /acceptBuilderProductionRepair/)
  assert.match(mergeWatchRoute, /acceptBuilderProductionRepair/)
  assert.match(mergeWatchRoute, /productionAcceptancePassed: true/)
})

test('failed live Production acceptance rolls back instead of reporting fixed', () => {
  assert.match(productionAcceptance, /runBuilderPlaywrightCliLiveAcceptance/)
  assert.match(productionAcceptance, /snapshotPort\.restore/)
  assert.match(productionAcceptance, /outcome: 'rolled_back'/)
  assert.match(productionAcceptance, /outcome: 'unresolved'/)
  assert.match(mergeRoute, /builder_repository_production_rolled_back/)
  assert.match(mergeWatchRoute, /builder_repository_production_rolled_back/)
})
