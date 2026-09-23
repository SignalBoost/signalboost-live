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
  assert.match(source, /maxDuration = 300/)
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
  assert.equal(item.schedule, '12,22,32,42,52 * * * *')
  assert.equal(vercel.env.COS_UNIVERSITY_RESIDENCY_ENABLED, 'true')
})


test('Residency cron auto-admits a bounded Builder cohort before practical execution', async () => {
  const source = await readFile(routeUrl, 'utf8')
  assert.match(source, /admitNextBuilderResidency/)
  assert.match(source, /activeLimit:\s*4/)
  assert.match(source, /runBuilderResidencyOrchestrator/)
  assert.ok(
    source.indexOf('admitNextBuilderResidency') <
    source.lastIndexOf('runBuilderResidencyOrchestrator'),
  )
  assert.match(source, /promotionAuthorized:\s*false/)
  assert.match(source, /productionTrafficAuthorized:\s*false/)
})
