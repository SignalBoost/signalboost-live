// Regression tests for the five deploy blockers raised in the 2026-10-11 review, one block per reviewed path.
// Each test fails against the original training patch (Customer-LAB-training-patch.zip) and passes against v5.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lab = await import('../lib/ai/cos/labCustomerTraining.ts')
const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
const START = '../app/api/lab/training/route.ts'
const CALLBACK = '../app/api/lab/training/callback/[token]/route.ts'
const DOWNLOAD = '../app/api/lab/training/download/route.ts'
const PAGE = '../app/dashboard/cos-university-telemetry/page.tsx'
const PANEL = '../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx'
const MIGRATION = '../supabase/migrations/20261012000000_lab_customer_provider_credentials_and_training.sql'
const HF_TOKEN = 'hf_' + 'x'.repeat(30)

async function realPlan() {
  const prompts = Array.from({ length: 24 }, (_, i) => `Q${i}`)
  const built = await lab.buildCustomerTeacherRows({ teacher: { id: 't', provider: 'p', model: 'm' }, prompts, generate: async p => `A ${p}` })
  const runId = randomUUID()
  const ports = {
    resolveNamespace: async () => 'acme', resolveHourlyUsd: async () => 0.6,
    submit: async () => ({ jobId: 'j1', jobUrl: 'u1' }), findByName: async () => null,
  }
  return lab.planCustomerJob({
    runId, envelope: lab.buildPrepareEnvelope({ runId, rows: built.rows, baseModel: 'Qwen/Q', baseModelRevision: null, datasetHash: built.datasetHash }),
    customerHfToken: HF_TOKEN, stageToken: lab.newStageToken().token, origin: 'https://app.example',
    platformEnv: { HF_TOKEN: 'hf_' + 'p'.repeat(30), COS_UNIVERSITY_HF_WORKER_URL: 'https://app.example/w.py' },
    maxHourlyUsd: 1, remainingBudgetUsd: 10, ports,
  } as any)
}

// ---- 1. saas/app/api/lab/training/route.ts: reservation + recoverable state saved before submission ----------------
test('[1] start route: no submitCustomerJob; reservation, callback token and job name are written before submit', () => {
  const src = read(START)
  assert.doesNotMatch(src, /submitCustomerJob/, 'old pre-reservation submit helper must be gone')
  assert.match(src, /runReservedJob\(/)
  // The reserve step records cost, the next stage-token hash (callback) and the deterministic job name together.
  assert.match(src, /reserve: p => record\('preparing_dataset'[\s\S]{0,300}hfPendingJobName: p\.jobName, jobSubmissionState: 'reserved' \}, p\.maxCostUsd, stage\.hash\)/)
})

test('[1] behaviour: submit is never called when the reservation write fails, and is called only after it succeeds', async () => {
  const plan = await realPlan()
  const log: string[] = []
  const ports = { submit: async () => { log.push('submit'); return { jobId: 'j1', jobUrl: 'u1' } }, findByName: async () => null } as any
  await assert.rejects(lab.runReservedJob({ plan, customerHfToken: HF_TOKEN, ports, book: {
    reserve: async () => { log.push('reserve-failed'); throw new Error('lab_worker_record_failed') },
    attach: async () => { log.push('attach') }, release: async () => { log.push('release') },
  } }))
  assert.deepEqual(log, ['reserve-failed'])
  log.length = 0
  await lab.runReservedJob({ plan, customerHfToken: HF_TOKEN, ports, book: {
    reserve: async () => { log.push('reserve') }, attach: async () => { log.push('attach') }, release: async () => { log.push('release') },
  } })
  assert.deepEqual(log, ['reserve', 'submit', 'attach'])
})

// ---- 2. callback route: reserve before training submit, DB errors not ignored, no duplicate paid submission --------
test('[2] callback route: record() throws on a database error and the reservation step uses it', () => {
  const src = read(CALLBACK)
  assert.match(src, /\.then\(\(\{ error: e \}: \{ error: any \}\) => \{ if \(e\) throw new Error/, 'record() must surface DB errors')
  assert.match(src, /reserve: p => record\('preparing_dataset', 'training'[\s\S]{0,200}jobSubmissionState: 'reserved' \}, p\.maxCostUsd, next\.hash\)/)
  assert.match(src, /runReservedJob\(\{ plan, customerHfToken: hfToken/)
  assert.doesNotMatch(src, /submitCustomerJob|ports\.submit\(|customerHfPorts\.submit\(/)
})

test('[2] behaviour: a callback whose record() returns { error } submits nothing', async () => {
  const plan = await realPlan()
  let submits = 0
  const fakeRpc = async () => ({ error: { message: 'lab_worker_stage_conflict' } })
  const record = () => fakeRpc().then(({ error: e }: { error: any }) => { if (e) throw new Error(String(e.message)) })
  await assert.rejects(lab.runReservedJob({ plan, customerHfToken: HF_TOKEN,
    ports: { submit: async () => { submits++; return { jobId: 'j', jobUrl: 'u' } }, findByName: async () => null } as any,
    book: { reserve: () => record(), attach: async () => {}, release: async () => {} } }), /stage_conflict/)
  assert.equal(submits, 0)
})

test('[2] behaviour: two concurrent deliveries of the same callback produce one paid submission', async () => {
  const plan = await realPlan()
  let stage = 'preparing_dataset'; let submits = 0
  // Mirrors itmounts_lab_worker_record_stage: row-locked compare-and-set on the expected stage.
  const reserveCas = async () => { if (stage !== 'preparing_dataset') throw new Error('lab_worker_stage_conflict'); stage = 'training' }
  const ports = { submit: async () => { submits++; return { jobId: 'j', jobUrl: 'u' } }, findByName: async () => null } as any
  const book = { reserve: reserveCas, attach: async () => {}, release: async () => {} }
  const results = await Promise.allSettled([
    lab.runReservedJob({ plan, customerHfToken: HF_TOKEN, ports, book }),
    lab.runReservedJob({ plan, customerHfToken: HF_TOKEN, ports, book }),
  ])
  assert.equal(submits, 1)
  assert.equal(results.filter(r => r.status === 'rejected').length, 1)
})

test('[2] database: stage token is single-use and stage writes are compare-and-set under a row lock', () => {
  const sql = read(MIGRATION)
  assert.match(sql, /itmounts_lab_worker_redeem_stage_token[\s\S]{0,800}for update[\s\S]{0,400}stage_token_hash = null/)
  assert.match(sql, /current_stage <> p_expected_stage then raise exception 'lab_worker_stage_conflict'/)
})

// ---- 3. teacher spend in the approved ceiling, executed through the governed Harness ------------------------------
test('[3] start route: no direct generateWithUniversityTeacher; teacher spend reserved/settled and Harness-governed', () => {
  const src = read(START)
  assert.doesNotMatch(src, /generateWithUniversityTeacher/)
  assert.match(src, /runGovernedTeacher\(/)
  assert.match(src, /itmounts_lab_customer_reserve_teacher/)
  assert.match(src, /itmounts_lab_customer_settle_teacher/)
  assert.match(src, /remainingBudgetUsd = built\.settlement\.remainingUsd/, 'HF job gets only what teacher spend left')
  const adapter = read('../platform-harness/adapters/lab-customer-teacher.ts')
  assert.match(adapter, /from '\.\/production\.ts'/, 'uses the existing production Harness request builder')
  assert.match(adapter, /withHarnessExecutionContext/)
  assert.match(adapter, /enforceProviderCostBudget: true/)
})

// ---- 4. download route: authorized delivery, never a private HF link or CLI command -------------------------------
test('[4] download route streams verified bytes; it returns no huggingface.co link and no CLI command', () => {
  const src = read(DOWNLOAD)
  assert.doesNotMatch(src, /https:\/\/huggingface\.co\/|huggingface-cli|hf download|git clone/)
  assert.match(src, /itmounts_lab_customer_open_run_download/, 'membership + completed run checked in the database')
  assert.match(src, /upstream\.body!\.pipeThrough\(verifyingStream\(decision\.file\)\)/)
  assert.doesNotMatch(src.replace(/^\s*\/\/.*$/gm, ''), /graduat|certif/i, 'no graduation/certification check in code')
})

// ---- 5. panel mounted on the telemetry page and fully translated ---------------------------------------------------
test('[5] telemetry page imports and renders the training section with the page language', () => {
  const page = read(PAGE)
  assert.match(page, /import LabCustomerTrainingSection from '\.\/LabCustomerTrainingSection\.tsx'/)
  assert.match(page, /<LabCustomerTrainingSection language=\{lang\} \/>/)
  assert.ok(page.indexOf('<LabExperimentPanel') < page.indexOf('<LabCustomerTrainingSection'), 'rendered below the experiment panel')
})

test('[5] panel has no hard-coded English UI text; all text comes from the translated copy', () => {
  const panel = read(PANEL)
  // JSX text nodes made only of words (e.g. >Start training<) would be untranslated copy.
  const literals = [...panel.matchAll(/>\s*([A-Za-z][A-Za-z ,.'!?-]{3,})\s*</g)].map(m => m[1].trim())
  assert.deepEqual(literals, [])
  assert.match(panel, /copy\./)
})
