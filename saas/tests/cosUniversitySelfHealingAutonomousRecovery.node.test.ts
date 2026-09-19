import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { preflightHfWorkerDelivery } from '../lib/ai/cos/cosUniversityHfWorkerDelivery.ts'

const recovery = readFileSync(new URL('../agent-gateway-host/university-distillation-recovery.ts', import.meta.url), 'utf8')
const resolver = readFileSync(new URL('../self-healing-host/native-repair-action-resolver.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/cos-university-distillation-supervisor/route.ts', import.meta.url), 'utf8')
const nativeLoop = readFileSync(new URL('../self-healing-host/native-autonomous-loop.ts', import.meta.url), 'utf8')
const universityCodeRepair = readFileSync(new URL('../self-healing-host/university-distillation-autonomous-repair.ts', import.meta.url), 'utf8')
const continuations = readFileSync(new URL('../app/api/cron/builder-continuations/route.ts', import.meta.url), 'utf8')

test('University registered recovery is autonomous and does not require owner approval', () => {
  assert.match(resolver, /requires_human_approval:\s*false/)
  assert.match(resolver, /requires_approval:\s*false/)
  assert.match(route, /remediateNativeIncidents\(monitoring\.incidents, \{ maxIncidents: 1 \}\)/)
  assert.doesNotMatch(route, /automaticRepairAllowed:\s*false/)
})

test('Self-Healing Supervisor preflights worker delivery before any paid recovery workflow', () => {
  const preflightAt = recovery.indexOf('const workerPreflight = await preflightWorker()')
  const workflowAt = recovery.indexOf('const workflow = await runWorkflow')
  assert.ok(preflightAt >= 0)
  assert.ok(workflowAt > preflightAt)
  assert.match(recovery, /paidDispatchSuppressed:\s*true/)
  assert.match(recovery, /automaticRetryOnLaterSupervisorTick:\s*true/)
  assert.match(recovery, /automaticPromotionAuthorized:\s*false/)
  assert.match(recovery, /runpodMutationAuthorized:\s*false/)
  assert.match(recovery, /authorityExpanded:\s*false/)
})

test('worker delivery preflight blocks an HTTP 404 before provider spending', async () => {
  const result = await preflightHfWorkerDelivery({
    env: {
      HF_TOKEN: 'hf_123456789012345678901234567890',
      ITMOUNTS_PUBLIC_ORIGIN: 'https://itmounts.example',
    },
    fetchImpl: async () => new Response('not found', { status: 404 }),
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 404)
  assert.equal(result.reason, 'hf_worker_delivery_http_404')
})

test('worker delivery preflight accepts only a plausible signed worker artifact and records a hash', async () => {
  const source = `${'# worker\n'.repeat(40)}ITMOUNTS_TRAINING_REQUEST = True\nHF_TOKEN = 'from-env'\n`
  const result = await preflightHfWorkerDelivery({
    env: {
      HF_TOKEN: 'hf_123456789012345678901234567890',
      ITMOUNTS_PUBLIC_ORIGIN: 'https://itmounts.example',
    },
    fetchImpl: async () => new Response(source, { status: 200 }),
  })
  assert.equal(result.ok, true)
  assert.equal(result.status, 200)
  assert.ok(result.sha256)
  assert.ok(result.bytes >= 256)
})


test('University packaging defect tries bounded runtime recovery before Platform Engineer escalation', () => {
  const dispatchAt = nativeLoop.indexOf('const dispatched = await dispatchRepairPlan({')
  const escalationAt = nativeLoop.indexOf('enqueueUniversityDistillationPackagingRepair(incident, diagnostic.diagnosis)', dispatchAt)
  assert.ok(dispatchAt >= 0)
  assert.ok(escalationAt > dispatchAt)
  assert.match(nativeLoop, /!dispatched\.completed && universityPackagingIncident/)
  assert.match(nativeLoop, /Registered runtime recovery did not restore packaging progress/)
  assert.match(nativeLoop, /Registered runtime recovery failed verification/)
})

test('University Platform Engineer escalation is exact, pinned, deduplicated, and authority preserving', () => {
  assert.match(universityCodeRepair, /curriculum_packaging_stalled/)
  assert.match(universityCodeRepair, /curriculumPackagingStalled === true/)
  assert.match(universityCodeRepair, /recoveryPreauthorized === true/)
  assert.match(universityCodeRepair, /authorityExpanded === false/)
  assert.match(universityCodeRepair, /automaticPromotionAuthorized === false/)
  assert.match(universityCodeRepair, /runpodMutationAuthorized === false/)
  assert.match(universityCodeRepair, /process\.env\.VERCEL_GIT_COMMIT_SHA/)
  assert.match(universityCodeRepair, /enqueueSignalBoostRepositoryRepairJob/)
  assert.match(universityCodeRepair, /selfHealingUniversityDistillation: true/)
  assert.match(universityCodeRepair, /MAX_AUTOMATIC_RETRIES = 3/)
  assert.match(universityCodeRepair, /Do not lower the 20-item batch minimum/)
  assert.match(universityCodeRepair, /do not.*expand provider\/spend\/promotion\/Production authority/i)
})

test('Builder continuation worker executes and retries University Self-Healing repository jobs', () => {
  assert.match(continuations, /selfHealingUniversityDistillation/)
  assert.match(continuations, /retryFailedUniversityDistillationRepair/)
  assert.match(continuations, /universityDistillationRepairQueued/)
  assert.match(continuations, /universityDistillationRepairRetried/)
  assert.match(continuations, /const selected = jobs\[0\] \|\| null/)
})
