// saas/tests/builderResidencyCron.node.test.ts
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const routeUrl = new URL(
  '../app/api/cron/cos-university-residency/route.ts',
  import.meta.url,
)
const vercelUrl = new URL('../vercel.json', import.meta.url)

test('Residency cron is CRON_SECRET-gated and feature-flagged', async () => {
  const source = await readFile(routeUrl, 'utf8')
  assert.match(source, /process\.env\.CRON_SECRET/)
  assert.match(source, /authorization/)
  assert.match(source, /Bearer/)
  assert.match(source, /COS_UNIVERSITY_RESIDENCY_ENABLED/)
  assert.match(source, /maxDuration = 600/)
})

test('Residency cron uses only the governed native practical host', async () => {
  const source = await readFile(routeUrl, 'utf8')
  assert.match(source, /createLiveBuilderResidencyExecutor/)
  assert.match(source, /createBuilderResidencyNativeAuthority/)
  assert.match(source, /BUILDER_RESIDENCY_NATIVE_CAPABILITIES/)
  assert.match(source, /runBuilderResidencyOrchestrator/)
  assert.match(source, /createSupervisorAuditHarnessEvidenceSink/)
  assert.doesNotMatch(source, /pull_request\.merge/)
  assert.doesNotMatch(source, /production\.deploy/)
  assert.doesNotMatch(source, /sql\.execute/)
})

test('Residency cron cannot enable final exams, promotion, or Production traffic', async () => {
  const source = await readFile(routeUrl, 'utf8')
  assert.match(source, /automaticFinalGateEnable:\s*false/)
  assert.match(source, /promotionAuthorized:\s*false/)
  assert.match(source, /productionTrafficAuthorized:\s*false/)
  assert.doesNotMatch(source, /gateEnforced:\s*true/)
})

test('Vercel schedules bounded Residency separately from final exams', async () => {
  const vercel = JSON.parse(await readFile(vercelUrl, 'utf8'))
  const item = vercel.crons.find(
    (entry: { path?: string }) =>
      entry.path === '/api/cron/cos-university-residency',
  )
  assert.ok(item)
  assert.equal(item.schedule, '2,12,22,32,42,52 * * * *')
  assert.equal(vercel.env.COS_UNIVERSITY_RESIDENCY_ENABLED, 'true')
})


test('Residency cron auto-admits a bounded Builder cohort before practical execution', async () => {
  const source = await readFile(routeUrl, 'utf8')
  assert.match(source, /admitNextBuilderResidency/)
  assert.match(source, /activeLimit: RESIDENCY_ACTIVE_LIMIT/)
  assert.match(source, /RESIDENCY_ACTIVE_LIMIT = 4/)
  assert.match(source, /runBuilderResidencyOrchestrator/)
  assert.ok(
    source.indexOf('admitNextBuilderResidency') <
    source.lastIndexOf('runBuilderResidencyOrchestrator'),
  )
  assert.match(source, /promotionAuthorized:\s*false/)
  assert.match(source, /productionTrafficAuthorized:\s*false/)
})


// Owner direction 2026-09-30: Residency runs one lane per resident in parallel (never more lanes than the admitted
// cohort), and each resident keeps its lane so its exact-artifact worker stays warm between ticks.
// Owner 2026-10-04: the lane count is the residency share of the declared worker pool, not a constant - four
// hardcoded lanes on a 10-worker pool were 13 reservations against 10.
test('Residency cron runs one bounded lane per admitted resident without widening active admission capacity', async () => {
  const source = await readFile(routeUrl, 'utf8')
  assert.match(source, /import \{ lineCapacity \} from '@\/lib\/ai\/cos\/cosUniversityLineCapacity'/)
  assert.doesNotMatch(source, /RESIDENCY_PARALLEL_LANES|RESIDENCY_CASES_PER_TICK/, 'no hardcoded lane count')
  assert.match(source, /const laneCapacity = lineCapacity\(\)\.residency/)
  assert.match(source, /RESIDENCY_ACTIVE_LIMIT = 4/)
  assert.match(source, /RESIDENCY_CASES_PER_LANE = 4/)
  assert.match(source, /attempt\s*<\s*RESIDENCY_CASES_PER_LANE/)
  assert.match(source, /await store\.planLanes\(laneCapacity\)/)
  assert.match(source, /maxCasesPerTick: laneCapacity \* RESIDENCY_CASES_PER_LANE,\s*laneCapacity,/)
  assert.match(source, /store\.pinnedTo\(enrollment\)/)
  assert.match(source, /Promise\.all\(laneStores\.map\(laneStore => runLane\(laneStore\)\)\)/)
  assert.match(source, /await runBuilderResidencyOrchestrator/)
  assert.match(source, /parallelExecution: lanes\.length > 1/)
  assert.match(source, /admitNextBuilderResidency\(\{ db, activeLimit: RESIDENCY_ACTIVE_LIMIT \}\)/)
})


test('Residency cron ends the lane after any infrastructure failure, including successful reconciliation', async () => {
  const source = await readFile(routeUrl, 'utf8')
  assert.match(source, /result\.state === 'case_not_completed'/)
  assert.match(source, /if \(execution\.result\?\.outcome\?\.status === 'infrastructure_failure'\) break/)
  assert.doesNotMatch(source, /selfHealing\?\.completed !== true/, 'recovery does not imply readiness')
  assert.match(source, /repairInfrastructure: actuateBuilderResidencyRuntimeRecovery/)
})
// end of saas/tests/builderResidencyCron.node.test.ts (if this line is missing, the paste was cut short)
