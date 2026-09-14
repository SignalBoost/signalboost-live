import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  conservativeObservedHuggingFaceCostUsd,
  inspectHuggingFaceJob,
} from '../lib/ai/cos/cosUniversityHuggingFaceJobReconciler.ts'

const ROOT = path.resolve(import.meta.dirname, '..')

test('HF reconciliation inspects the authoritative namespace/job endpoint without provider mutation', async () => {
  let observedUrl = ''
  let observedAuth = ''
  const job = await inspectHuggingFaceJob({
    namespace: 'cadomos',
    jobId: '6aa820035527934177edea5c',
    token: `hf_${'x'.repeat(48)}`,
    fetchImpl: async (url, init) => {
      observedUrl = url
      observedAuth = String((init?.headers as Record<string, string>)?.authorization || '')
      assert.equal(init?.method, undefined)
      return new Response(JSON.stringify({
        id: '6aa820035527934177edea5c',
        status: { stage: 'ERROR', message: 'worker failed' },
        created_at: '2026-09-14T16:25:39Z',
        started_at: '2026-09-14T16:25:50Z',
        finished_at: '2026-09-14T16:27:10Z',
        durations: { scheduling_secs: 11, running_secs: 80, total_secs: 91 },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  assert.equal(observedUrl, 'https://huggingface.co/api/jobs/cadomos/6aa820035527934177edea5c')
  assert.match(observedAuth, /^Bearer hf_/)
  assert.equal(job.stage, 'ERROR')
  assert.equal(job.runningSeconds, 80)
  assert.equal(job.totalSeconds, 91)
})

test('HF reconciliation rejects unknown provider states instead of inventing progress', async () => {
  await assert.rejects(() => inspectHuggingFaceJob({
    namespace: 'cadomos',
    jobId: '6aa820035527934177edea5c',
    token: `hf_${'x'.repeat(48)}`,
    fetchImpl: async () => new Response(JSON.stringify({
      id: '6aa820035527934177edea5c',
      status: { stage: 'MYSTERY' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  }), /inspection_invalid/)
})

test('terminal cost settlement rounds conservatively by minute and cannot exceed the stage reserve', () => {
  const baseJob = {
    jobId: 'job-1', stage: 'ERROR' as const, message: null,
    createdAt: null, startedAt: null, finishedAt: null,
    schedulingSeconds: 11, runningSeconds: 80, totalSeconds: 91,
  }
  assert.equal(conservativeObservedHuggingFaceCostUsd({ job: baseJob, hourlyCostUsd: 0.4, reservedCostUsd: 0.2 }), 0.013333)
  assert.equal(conservativeObservedHuggingFaceCostUsd({ job: { ...baseJob, totalSeconds: 5000 }, hourlyCostUsd: 0.4, reservedCostUsd: 0.2 }), 0.2)
  assert.equal(conservativeObservedHuggingFaceCostUsd({ job: { ...baseJob, totalSeconds: null, runningSeconds: null }, hourlyCostUsd: 0.4, reservedCostUsd: 0.2 }), 0.2)
})

test('mass cron reconciles accepted HF work before claiming another paid stage', () => {
  const route = fs.readFileSync(path.join(ROOT, 'app/api/cron/cos-university-mass-distillation/route.ts'), 'utf8')
  const reconcileAt = route.indexOf('await reconcileMassDistillationHuggingFaceJobs({ maxJobs: 10 })')
  const consumeAt = route.indexOf('await runMassDistillationCampaignConsumer({ maxDispatches: 3 })')
  assert.ok(reconcileAt >= 0 && consumeAt > reconcileAt)
})

test('provider-terminal settlement clears only live reserve and never grants retry or promotion', () => {
  const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260914171000_cos_university_mass_distillation_hf_reconcile.sql'), 'utf8')
  assert.match(migration, /stage_reserved_cost_usd = 0/)
  assert.match(migration, /committed_cost_usd = greatest\(0, c\.committed_cost_usd - v_release\)/)
  assert.match(migration, /v_observed := least/)
  assert.match(migration, /automaticRetryAuthorized', false/)
  assert.doesNotMatch(migration, /stage\s*=\s*'teacher_pending'|automatic_promotion_authorized\s*=\s*true/i)
  assert.doesNotMatch(migration, /runpod[_a-zA-Z0-9]*\s*\(|runpod[_a-zA-Z0-9]*\s*=/i)
})

test('overdue nonterminal HF work is observed but never automatically retried', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityHuggingFaceJobReconciler.ts'), 'utf8')
  assert.match(source, /mass_distillation_provider_timeout_overdue/)
  assert.match(source, /NONTERMINAL_STAGES\.has\(job\.stage\)/)
  assert.match(source, /continue/)
  assert.doesNotMatch(source, /cancelHuggingFaceJob|method:\s*['"]DELETE['"]/)
})
