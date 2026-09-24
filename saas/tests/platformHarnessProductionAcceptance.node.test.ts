import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const source=(p:string)=>readFileSync(join(process.cwd(),p),'utf8')

test('Production Harness acceptance matrix covers every platform-wide evidence class',()=>{
  const canary=source('platform-harness/acceptance/production-canary.ts')
  for(const token of [
    'Production Harness acceptance: bounded read',
    'Production Harness acceptance: reversible write',
    'Production Harness acceptance: consequential rollback',
    'Production Harness acceptance: parent delegation',
    'Production Harness acceptance: child delegation',
    'Production Harness acceptance: deadline abort',
    'Production Harness acceptance: concurrency ceiling',
    'Production Harness acceptance: hard cost ceiling',
    'Production Harness acceptance: infrastructure failure routing',
    'Production Harness acceptance: competency failure routing',
    'Production Harness acceptance: authority boundary routing',
  ]) assert.ok(canary.includes(token), `missing acceptance case: ${token}`)
  assert.match(canary,/route!=='self_healing'/)
  assert.match(canary,/route!=='university_remediation'/)
  assert.match(canary,/route!=='referee_guardian'/)
  assert.match(canary,/route!=='harness_assurance'/)
  assert.match(canary,/outcomeStatus!=='verification_failure'/)
  assert.match(canary,/compensationStatus!=='completed'/)
  assert.match(canary,/harness_deadline_exceeded/)
  assert.match(canary,/harness_concurrency_limit_exceeded/)
  assert.match(canary,/harness_cost_budget_required/)
  assert.match(canary,/PLATFORM_HARNESS_PRODUCTION_ACCEPTANCE_EVENT/)
})

test('Production acceptance uses only service-role scratch state and immutable supervisor audit',()=>{
  const migration=source('supabase/migrations/20260924141500_platform_harness_production_acceptance_scratch.sql')
  const route=source('app/api/cron/platform-harness-production-acceptance/route.ts')
  assert.match(migration,/platform_harness_acceptance_scratch/)
  assert.match(migration,/enable row level security/i)
  assert.match(migration,/revoke all on table public\.platform_harness_acceptance_scratch from anon, authenticated/i)
  assert.match(migration,/grant all on table public\.platform_harness_acceptance_scratch to service_role/i)
  assert.match(route,/VERCEL_ENV !== 'production'/)
  assert.match(route,/VERCEL_GIT_COMMIT_SHA/)
  assert.match(route,/deployment_already_accepted/)
  assert.match(route,/runPlatformHarnessProductionAcceptance/)
})


test('Production acceptance cadence stays near-immediate for fast-moving main',()=>{
  const vercel=JSON.parse(source('vercel.json')) as {crons?: Array<{path?:string;schedule?:string}>}
  const cron=vercel.crons?.find(item=>item.path==='/api/cron/platform-harness-production-acceptance')
  assert.ok(cron,'Production Harness acceptance cron must remain registered')
  assert.equal(cron.schedule,'* * * * *','exact deployments must be eligible for certification every minute')
})
