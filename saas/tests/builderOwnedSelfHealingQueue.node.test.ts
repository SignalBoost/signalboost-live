import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const route = readFileSync(fileURLToPath(new URL('../app/api/cron/builder-continuations/route.ts', import.meta.url)), 'utf8')

test('Builder continuation cron picks both owned site and owned Audit Self-Healing jobs', () => {
  assert.match(route, /selfHealingOwnedSite/)
  assert.match(route, /selfHealingOwnedAudit/)
  assert.match(route, /queuedOwnedSelfHealingRepairs/)
  assert.match(route, /queuedOwnedRepair\('selfHealingOwnedSite', 'site'\)/)
  assert.match(route, /queuedOwnedRepair\('selfHealingOwnedAudit', 'audit'\)/)
  assert.match(route, /\.eq\('owner_authorized', true\)/)
  assert.match(route, /\.eq\('status', 'queued'\)/)
  assert.match(route, /\.eq\('job_kind', 'standard'\)/)
})

test('Builder continuation auth still precedes all queue reads and execution', () => {
  const authIndex = route.indexOf("status: 401")
  const continuationIndex = route.indexOf('await listBuilderContinuations')
  const ownedIndex = route.indexOf('await queuedOwnedSelfHealingRepairs')
  const runIndex = route.indexOf('await Promise.all(jobs.map(job => runBuilderJob')
  assert.ok(authIndex >= 0)
  assert.ok(authIndex < continuationIndex)
  assert.ok(continuationIndex < ownedIndex)
  assert.ok(ownedIndex < runIndex)
})

test('Builder continuation response exposes site and Audit pickup independently', () => {
  assert.match(route, /ownedSiteRepairQueued:/)
  assert.match(route, /ownedAuditRepairQueued:/)
  assert.match(route, /job\.kind === 'site'/)
  assert.match(route, /job\.kind === 'audit'/)
})
