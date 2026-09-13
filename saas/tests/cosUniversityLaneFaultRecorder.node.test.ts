// saas/tests/cosUniversityLaneFaultRecorder.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SOURCE = readFileSync(new URL('../lib/ai/cos/cosUniversityLaneFaultRecorder.ts', import.meta.url), 'utf8')
const MIGRATION = readFileSync(
  new URL('../supabase/migrations/20260913041500_cos_university_lane_fault_events.sql', import.meta.url), 'utf8')
const VERCEL = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')

test('the migration admits lane_fault without dropping an existing evidence class', () => {
  for (const kind of ['fine_tune', 'production_path', 'learning_outcome', 'team_contribution', 'integrity_violation', 'lane_fault']) {
    assert.match(MIGRATION, new RegExp(`'${kind}'`))
  }
})

test('a lane fault is recorded as an observation, never as academic evidence', () => {
  assert.match(SOURCE, /expected_lane_not_running_not_academic_evidence/)
  // It may only ever touch the assurance ledger; no academic table is reachable from here.
  assert.equal(/from\('cos_university_(assessments|exam_runs|credentials|study_plans)'\)/.test(SOURCE), false)
  assert.match(SOURCE, /from\('cos_university_learning_assurance_events'\)/)
})

test('the reader that decides verification never reads lane_fault rows', () => {
  const reader = readFileSync(new URL('../lib/ai/cos/cosUniversityProductionVerification.ts', import.meta.url), 'utf8')
  assert.match(reader, /\.eq\('event_type', 'production_path'\)/)
  assert.equal(reader.includes("'lane_fault'"), false)
})

test('an observation that cannot name its exact build is skipped rather than stored', () => {
  assert.match(SOURCE, /not_production_deployment/)
  assert.match(SOURCE, /VERCEL_GIT_COMMIT_SHA/)
  assert.match(SOURCE, /VERCEL_DEPLOYMENT_ID/)
})

// The Supabase client this module reaches uses a TypeScript parameter property, which Node's
// strip-only loader cannot parse, so no repo test imports a db-touching module directly. These
// assertions read the source, matching how every other assurance writer is covered.
test('a healthy sweep returns before touching the database', () => {
  assert.match(SOURCE, /if \(!faults\.length\) return \{ recorded: 0, faults: \[\], skipped: null \}/)
  const beforeDb = SOURCE.slice(0, SOURCE.indexOf('const db = cosServiceDb()'))
  assert.match(beforeDb, /!faults\.length/)
})

test('fresh deployments wait through one full hourly schedule before recording dark-lane absence', () => {
  assert.match(SOURCE, /FIRST_SCHEDULE_GRACE_MS = 65 \* 60_000/)
  assert.match(SOURCE, /\.eq\('event_type', 'production_path'\)/)
  assert.match(SOURCE, /\.eq\('deployment_id', deploymentId\)/)
  assert.match(SOURCE, /\.eq\('commit_sha', commitSha\)/)
  assert.match(SOURCE, /\.order\('observed_at', \{ ascending: true \}\)/)
  assert.match(SOURCE, /fault\.laneStatus !== 'unexpectedly_dark'/)
  assert.match(SOURCE, /fresh_deployment_schedule_grace/)
  // The two lanes that produced the observed false positives are hourly, so a 65-minute bound
  // covers the worst post-slot deploy plus scheduler tolerance without becoming an indefinite mute.
  assert.match(VERCEL, /"\/api\/cron\/cos-university-exam"\s*,\s*"schedule"\s*:\s*"0 \* \* \* \*"/)
  assert.match(VERCEL, /"\/api\/cron\/cos-university-a-range"\s*,\s*"schedule"\s*:\s*"10 \* \* \* \*"/)
})

test('startup grace suppresses only absence; explicit fault classes remain immediately recordable', () => {
  const graceFilter = SOURCE.slice(
    SOURCE.indexOf("if (startupGraceActive)"),
    SOURCE.indexOf("if (!effectiveFaults.length)"),
  )
  assert.match(graceFilter, /fault\.laneStatus !== 'unexpectedly_dark'/)
  assert.equal(graceFilter.includes('unexpectedly_disabled'), false)
  assert.equal(graceFilter.includes('unexpectedly_enabled'), false)
  assert.equal(graceFilter.includes('undeclared'), false)
})

test('identity is bucketed by hour so a standing fault does not flood the ledger', () => {
  assert.match(SOURCE, /hourBucket/)
  assert.match(SOURCE, /slice\(0, 13\)/)
  assert.match(SOURCE, /ignoreDuplicates: true/)
})

test('the fault identity includes the status, so a changed fault is recorded separately', () => {
  assert.match(SOURCE, /input\.laneStatus, input\.commitSha/)
})
