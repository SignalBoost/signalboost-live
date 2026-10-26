import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const live = readFileSync(new URL('../live-acceptance/cosAnalyticalLive.playwright.spec.ts', import.meta.url),'utf8')
const launch = readFileSync(new URL('../scripts/cos-live-acceptance.mjs', import.meta.url),'utf8')
const config = readFileSync(new URL('../playwright.live.config.ts', import.meta.url),'utf8')

test('COS live acceptance is isolated from mocked UI tests and requires authenticated target', () => {
  assert.match(config, /testDir: '\.\/live-acceptance'/)
  assert.match(config, /storageState/)
  assert.match(launch, /COS_LIVE_BASE_URL/)
  assert.match(launch, /COS_LIVE_STORAGE_STATE/)
  assert.match(launch, /https:/)
  assert.match(launch, /COS_LIVE_EXPECTED_COMMIT/)
  assert.match(launch, /--no-install/)
})
test('live certification calls real COS ingress and rejects unavailable analytical deliverables', () => {
  assert.match(live, /request\.post\('\/api\/cos-browser'/)
  assert.doesNotMatch(live, /page\.route\(|route\.fulfill\(/)
  assert.match(live, /missingAnalyticalTasks\(scenario\.prompt, answer\)/)
  assert.match(live, /rejectedFallback: refusal/)
  assert.match(live, /expect\(missing, JSON\.stringify\(receipt\)\)\.toEqual\(\[\]\)/)
  assert.match(live, /PostgreSQL storage growth/)
  assert.match(live, /queue replay and reconciliation/)
})
