import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const route = readFileSync(fileURLToPath(new URL('../app/api/cron/builder-continuations/route.ts', import.meta.url)), 'utf8')
const jobRunner = readFileSync(fileURLToPath(new URL('../lib/builder/job-runner.ts', import.meta.url)), 'utf8')

test('Builder continuation cron picks both owned site and owned Audit Self-Healing jobs', () => {
  assert.match(route, /selfHealingOwnedSite/)
  assert.match(route, /selfHealingOwnedAudit/)
  assert.match(route, /queuedOwnedSelfHealingRepairs/)
  assert.match(route, /queuedOwnedRepair\('selfHealingOwnedSite', 'site'\)/)
  assert.match(route, /queuedOwnedRepair\('selfHealingOwnedAudit', 'audit'\)/)
  assert.match(route, /\.eq\('owner_authorized', true\)/)
  assert.match(route, /\.eq\('status', 'queued'\)/)
  assert.match(route, /\.eq\('job_kind', 'standard'\)/)
  assert.match(route, /retryFailedOwnedAuditEngineRepair/)
  assert.match(route, /ownedAuditRepairRetried:/)
})

test('Builder continuation auth still precedes all queue reads and execution', () => {
  const authIndex = route.indexOf("status: 401")
  const continuationIndex = route.indexOf('await listBuilderContinuations')
  const ownedIndex = route.indexOf('await queuedOwnedSelfHealingRepairs')
  const runIndex = route.indexOf('if (selected) await runBuilderJob')
  assert.ok(authIndex >= 0)
  assert.ok(authIndex < continuationIndex)
  assert.ok(continuationIndex < ownedIndex)
  assert.ok(ownedIndex < runIndex)
})

test('Builder continuation cron exposes a distinct owner Playwright CLI canary lane', () => {
  assert.match(route, /builderPlaywrightCliCanary/)
  assert.match(route, /queuedOwnedRepair\('builderPlaywrightCliCanary', 'playwright-cli-canary'\)/)
  assert.match(route, /playwrightCliCanaryQueued:/)
})

test('explicit Playwright CLI production canary is not starved by Self-Healing backlog', () => {
  const continuationIndex = route.indexOf('...continuations')
  const canaryIndex = route.indexOf('...(playwrightCliCanary ? [playwrightCliCanary] : [])')
  const repairsIndex = route.indexOf('...ownedRepairs', canaryIndex)
  assert.ok(continuationIndex >= 0)
  assert.ok(canaryIndex > continuationIndex)
  assert.ok(repairsIndex > canaryIndex)
})

test('Builder continuation response exposes site and Audit pickup independently', () => {
  assert.match(route, /ownedSiteRepairQueued:/)
  assert.match(route, /ownedAuditRepairQueued:/)
  assert.match(route, /job\.kind === 'site'/)
  assert.match(route, /job\.kind === 'audit'/)
})

test('owner Playwright CLI canary executes deterministic five-step proof before normal Builder work', () => {
  const guard = "job.ownerAuthorized === true && job.metadata.builderPlaywrightCliCanary === true"
  assert.match(jobRunner, /runBuilderPlaywrightCliCanary/)
  assert.ok(jobRunner.includes(guard))
  assert.match(jobRunner, /action: 'open' as const, url: 'https:\/\/itmounts\.com\/'/)
  assert.match(jobRunner, /action: 'snapshot' as const/)
  assert.match(jobRunner, /action: 'console' as const, level: 'info' as const/)
  assert.match(jobRunner, /action: 'requests' as const/)
  assert.match(jobRunner, /action: 'close' as const/)
  assert.match(jobRunner, /PLAYWRIGHT_CLI_CANARY_COMPLETE/)
  assert.match(jobRunner, /builder-playwright-cli-production-canary-v1/)
  const guardIndex = jobRunner.indexOf(guard)
  const workspaceIndex = jobRunner.indexOf('const workspace = createSupabaseBuilderWorkspace', guardIndex)
  assert.ok(guardIndex >= 0)
  assert.ok(workspaceIndex > guardIndex)
})

test('Playwright CLI canary persists metadata-only browser evidence', () => {
  const start = jobRunner.indexOf('async function runBuilderPlaywrightCliCanary')
  const end = jobRunner.indexOf('/**\n * Execute one already-enqueued Builder job', start)
  const canary = jobRunner.slice(start, end)
  assert.match(canary, /action: observed\.action/)
  assert.match(canary, /ok: observed\.ok/)
  assert.match(canary, /exitCode: observed\.exitCode/)
  assert.match(canary, /timedOut: observed\.timedOut/)
  assert.doesNotMatch(canary, /stdout:/)
  assert.doesNotMatch(canary, /stderr:/)
  assert.doesNotMatch(canary, /result:\s*observed/)
})



test('rolled-back production recovery is a first-class prioritized self-healing queue', () => {
  assert.match(continuationRoute, /selfHealingProductionRecovery/)
  assert.match(continuationRoute, /production-recovery/)
  assert.match(continuationRoute, /productionRecoveryQueued/)
  assert.match(jobRunner, /job\.metadata\.selfHealingProductionRecovery === true/)
})
