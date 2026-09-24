import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root=process.cwd()
const source=(path:string)=>readFileSync(join(root,path),'utf8')

test('Production Harness acceptance covers the full required matrix through the shared envelope',()=>{
  const canary=source('platform-harness/acceptance/production-canary.ts')
  const route=source('app/api/cron/platform-harness-production-acceptance/route.ts')
  const migration=source('supabase/migrations/20260924143000_platform_harness_acceptance_scratch.sql')

  assert.match(canary,/runProductionHarnessEnvelope/)
  assert.match(canary,/createGovernedHarnessExecutor/)
  assert.match(canary,/createSupervisorAuditHarnessEvidenceSink/)
  for(const target of [
    'harness.acceptance.read',
    'harness.acceptance.write',
    'harness.acceptance.consequential',
    'harness.acceptance.delegate',
    'harness.acceptance.deadline',
    'harness.acceptance.concurrency',
    'harness.acceptance.cost',
  ]) assert.ok(canary.includes(target),`missing acceptance target ${target}`)

  assert.match(canary,/preconditionEvidenceRefs/)
  assert.match(canary,/compensation:\{mode:'compensate'/)
  assert.match(canary,/await scratchExists\(db,scratchKey\)/)
  assert.match(canary,/failureCode!=='harness_deadline_exceeded'/)
  assert.match(canary,/failureCode!=='harness_concurrency_limit_exceeded'/)
  assert.match(canary,/failureCode!=='harness_cost_budget_required'/)
  assert.match(canary,/parentManifest:parentCtx\.manifest/)
  assert.match(canary,/parentRunId!==parentRunId/)

  assert.match(route,/VERCEL_ENV!=='production'/)
  assert.match(route,/VERCEL_GIT_COMMIT_SHA/)
  assert.match(route,/productionDeploymentFingerprint/)
  assert.match(route,/PLATFORM_HARNESS_PRODUCTION_ACCEPTANCE_EVENT/)
  assert.match(route,/customerDataTouched:false/)
  assert.match(route,/hiddenReasoningPersisted:false/)

  assert.match(migration,/platform_harness_acceptance_scratch/)
  assert.match(migration,/enable row level security/i)
  assert.match(migration,/revoke all on table public\.platform_harness_acceptance_scratch\s+from public, anon, authenticated/i)
  assert.match(migration,/grant select, insert, update, delete on table public\.platform_harness_acceptance_scratch\s+to service_role/i)
})

test('Production acceptance is scheduled and full Production gate includes its regression',()=>{
  const vercel=source('vercel.json')
  const gate=source('scripts/vercel-cos-gates.mjs')
  assert.match(vercel,/\/api\/cron\/platform-harness-production-acceptance/)
  assert.match(gate,/tests\/platformHarnessProductionAcceptance\.node\.test\.ts/)
})
