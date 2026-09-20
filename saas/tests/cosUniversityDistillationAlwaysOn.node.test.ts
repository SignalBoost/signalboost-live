import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('HF mass distillation control loop wakes every minute while governance remains separate', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const worker = config.crons.find((row: any) => row.path === '/api/cron/cos-university-mass-distillation')
  const supervisor = config.crons.find((row: any) => row.path === '/api/cron/cos-university-distillation-supervisor')

  assert.deepEqual(worker, {
    path: '/api/cron/cos-university-mass-distillation',
    schedule: '* * * * *',
  })
  assert.deepEqual(supervisor, {
    path: '/api/cron/cos-university-distillation-supervisor',
    schedule: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
  })
})


test('every-minute wake is protected by one durable expiring workflow lease', () => {
  const workflow = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts', import.meta.url), 'utf8')
  const lease = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillationWorkflowLease.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/20260920053700_mass_distillation_workflow_singleflight.sql', import.meta.url), 'utf8')

  assert.match(workflow, /claimUniversityMassDistillationWorkflowLease/)
  assert.match(workflow, /reason: 'workflow_lease_held'/)
  assert.match(workflow, /releaseUniversityMassDistillationWorkflowLease\(lease\.ownerToken\)/)
  assert.match(lease, /UNIVERSITY_MASS_DISTILLATION_WORKFLOW_LEASE_TTL_SECONDS = 330/)
  assert.match(migration, /on conflict \(scope\) do update/)
  assert.match(migration, /expires_at <= v_now/)
  assert.match(migration, /grant execute on function public\.claim_cos_university_mass_distillation_workflow_lease\(uuid,integer\)[\s\S]*to service_role/)
  assert.match(migration, /revoke all on function public\.claim_cos_university_mass_distillation_workflow_lease\(uuid,integer\)[\s\S]*from public, anon, authenticated/)
})
