// Deploy blockers (2026-10-11 review): job bookkeeping order, governed teacher calls, member downloads.
// Since 2026-10-12 the platform does not price provider work: jobs run on the customer's key and their provider bills them.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lab = await import('../lib/ai/cos/labCustomerTraining.ts')
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const HF_TOKEN = 'hf_' + 'x'.repeat(30)
const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')

const FILES = [
  { path: 'adapter_model.safetensors', size: 3, sha256: sha('abc'), gitOid: null },
  { path: 'config.json', size: 2, sha256: null, gitOid: createHash('sha1').update('blob 2\0{}').digest('hex') },
]
const DONE = { stage: 'completed', artifactRepo: 'acme/itmounts-student-pool-00', artifactRevision: 'a'.repeat(40), artifactFiles: FILES }

test('download: LAB membership + completed run + file in the recorded manifest — never graduation, no HF access needed', () => {
  assert.equal(lab.decideModelDownload({ activeMember: true, run: DONE, path: 'config.json' }).allowed, true)
  assert.equal(lab.decideModelDownload({ activeMember: false, run: DONE, path: 'config.json' }).allowed, false)
  assert.deepEqual(lab.decideModelDownload({ activeMember: true, run: { ...DONE, stage: 'training' }, path: 'config.json' }), { allowed: false, reason: 'not_ready' })
  assert.deepEqual(lab.decideModelDownload({ activeMember: true, run: DONE, path: '../secrets' }), { allowed: false, reason: 'file_not_in_artifact' })
  assert.deepEqual(lab.decideModelDownload({ activeMember: true, run: { ...DONE, artifactRevision: 'main' }, path: 'config.json' }), { allowed: false, reason: 'artifact_invalid' })
  assert.doesNotMatch(lab.decideModelDownload.toString(), /graduat|residency|certif/i)
  const route = read('../app/api/lab/training/download/route.ts')
  assert.match(route, /itmounts_lab_customer_open_run_download/)
  assert.match(route, /verifyingStream/)
  assert.doesNotMatch(route, /huggingface\.co\//) // no private link handed to the member
})

async function pipe(file: any, body: string) {
  return new Response(new Response(body).body!.pipeThrough(lab.verifyingStream(file))).text()
}
test('download stream is verified against the manifest (LFS sha256 and git blob sha1)', async () => {
  assert.equal(await pipe(FILES[0], 'abc'), 'abc')
  assert.equal(await pipe(FILES[1], '{}'), '{}')
  await assert.rejects(pipe(FILES[0], 'abd'), /integrity_failed/)
  await assert.rejects(pipe(FILES[0], 'abcd'), /size_mismatch/)
  await assert.rejects(pipe(FILES[1], '[]'), /integrity_failed/)
})

async function planInput(overrides: Record<string, unknown> = {}) {
  const prompts = Array.from({ length: 24 }, (_, i) => `Q${i}`)
  const built = await lab.buildCustomerTeacherRows({ teacher: { id: 't', provider: 'p', model: 'm' }, prompts, generate: async p => `A ${p}` })
  const runId = randomUUID()
  return {
    runId, envelope: lab.buildPrepareEnvelope({ runId, rows: built.rows, baseModel: 'Qwen/Q', baseModelRevision: null, datasetHash: built.datasetHash }),
    customerHfToken: HF_TOKEN, stageToken: lab.newStageToken().token, origin: 'https://app.example',
    platformEnv: { HF_TOKEN: 'hf_' + 'p'.repeat(30), COS_UNIVERSITY_HF_WORKER_URL: 'https://app.example/w.py' },
    ...overrides,
  }
}
function fakeHf(opts: { submit?: 'ok' | 'throw'; find?: 'none' | 'found' | 'throw' } = {}) {
  const calls: string[] = []
  const ports = {
    resolveNamespace: async () => 'acme',
    submit: async (_ns: string, tok: string) => { calls.push(`submit:${tok === HF_TOKEN ? 'customer' : 'OTHER'}`); if (opts.submit === 'throw') throw new Error('huggingface_training_job_rejected:502'); return { jobId: 'j1', jobUrl: 'u1' } },
    findByName: async () => { calls.push('find'); if (opts.find === 'throw') throw new Error('x'); return opts.find === 'found' ? { jobId: 'j2', jobUrl: 'u2' } : null },
  }
  const book = {
    reserve: async (p: any) => { calls.push(`reserve:${p.jobName.startsWith('itmounts-prepare_dataset-')}`) },
    attach: async (j: any) => { calls.push(`attach:${j.jobId}`) },
    release: async (r: string) => { calls.push(`release:${r}`) },
  }
  return { calls, ports, book }
}
const plan = async (h: ReturnType<typeof fakeHf>, o: Record<string, unknown> = {}) => lab.planCustomerJob({ ...(await planInput(o)), ports: h.ports } as any)

test('planning submits nothing and carries no price: only the job spec, namespace and deterministic job name', async () => {
  const h = fakeHf()
  const planned = await plan(h)
  assert.deepEqual(Object.keys(planned).sort(), ['jobName', 'namespace', 'spec'])
  assert.equal(planned.namespace, 'acme')
  assert.deepEqual(h.calls, [])
})

test('job order: job details saved BEFORE submission, then the job id attached', async () => {
  const h = fakeHf()
  const out = await lab.runReservedJob({ plan: await plan(h), customerHfToken: HF_TOKEN, ports: h.ports, book: h.book })
  assert.equal(out.status, 'submitted')
  assert.deepEqual(h.calls, ['reserve:true', 'submit:customer', 'attach:j1'])
})

test('a failed record write means no job is submitted', async () => {
  const h = fakeHf()
  const p = await plan(h)
  await assert.rejects(lab.runReservedJob({ plan: p, customerHfToken: HF_TOKEN, ports: h.ports, book: { ...h.book, reserve: async () => { throw new Error('lab_worker_stage_conflict') } } }), /stage_conflict/)
  assert.deepEqual(h.calls, [])
})

test('submit error: a job HF accepted anyway is found by name and attached, never released', async () => {
  const h = fakeHf({ submit: 'throw', find: 'found' })
  const out = await lab.runReservedJob({ plan: await plan(h), customerHfToken: HF_TOKEN, ports: h.ports, book: h.book })
  assert.deepEqual(out, { status: 'submitted', jobId: 'j2', jobUrl: 'u2', recoveredByName: true })
  assert.deepEqual(h.calls.slice(1), ['submit:customer', 'find', 'attach:j2'])
})

test('submit error with no job found closes the record; an unprovable state keeps it', async () => {
  let h = fakeHf({ submit: 'throw', find: 'none' })
  assert.equal((await lab.runReservedJob({ plan: await plan(h), customerHfToken: HF_TOKEN, ports: h.ports, book: h.book })).status, 'not_submitted')
  assert.equal(h.calls.at(-1), 'release:huggingface_training_job_rejected')
  h = fakeHf({ submit: 'throw', find: 'throw' })
  assert.equal((await lab.runReservedJob({ plan: await plan(h), customerHfToken: HF_TOKEN, ports: h.ports, book: h.book })).status, 'unknown')
  assert.ok(!h.calls.some(c => c.startsWith('release')))
})

test('attach failure after submit is reported; the saved job name lets "Check status" reconcile it', async () => {
  const h = fakeHf()
  const out = await lab.runReservedJob({ plan: await plan(h), customerHfToken: HF_TOKEN, ports: h.ports, book: { ...h.book, attach: async () => { throw new Error('db') } } })
  assert.equal(out.status, 'submitted_unattached')
  assert.match(read('../app/api/lab/training/route.ts'), /jobSubmissionState === 'reserved' && opened\.hfPendingJobName/)
})

test('both routes submit only through runReservedJob', () => {
  for (const f of ['../app/api/lab/training/route.ts', '../app/api/lab/training/callback/[token]/route.ts']) {
    const src = read(f)
    assert.match(src, /runReservedJob\(/)
    assert.doesNotMatch(src, /submitHuggingFaceJob|ports\.submit\(|customerHfPorts\.submit\(/)
  }
})

test('teacher provider calls live only in the governed module, which runs them inside the Platform Harness', () => {
  for (const f of ['../app/api/lab/training/route.ts', '../app/api/lab/training/callback/[token]/route.ts']) {
    assert.doesNotMatch(read(f), /generateWithUniversityTeacher|BUILTIN_UNIVERSITY_TEACHER_ADAPTERS/)
  }
  const gov = read('../lib/ai/cos/labCustomerGovernedTeacher.ts')
  assert.match(gov, /withCustomerLabTeacherHarness/)
  assert.doesNotMatch(gov, /rateCard|\.reserve\(|\.settle\(|[a-z]Usd\b/)
  const adapter = read('../platform-harness/adapters/lab-customer-teacher.ts')
  assert.match(adapter, /maxToolCalls: input\.maxCalls/)
  assert.match(adapter, /risk: 'consequential'/)
})

test('customer examples become worker-valid rows without any provider call', () => {
  const lines = Array.from({ length: 25 }, (_, i) => JSON.stringify({ prompt: `Q${i}`, response: `A${i}` })).join('\n') + '\nnot json'
  const parsed = lab.rowsFromExamples(lines)
  assert.equal(parsed.rows.length, 25); assert.equal(parsed.invalidLines, 1)
  for (const row of parsed.rows) assert.equal(sha(row.text), row.itemHash)
})

test('the migrations save callback token and job name together, keep tokens on refresh, and drop provider prices', () => {
  const sql = read('../supabase/migrations/20261012000000_lab_customer_provider_credentials_and_training.sql')
  assert.match(sql, /hf_pending_job_name/)
  assert.match(sql, /p_next_token_hash = 'keep'/)
  assert.match(sql, /release_customer_job_reservation[\s\S]*job_submission_state is distinct from 'reserved'/)
  assert.match(sql, /itmounts_lab_customer_open_run_download[\s\S]*customer_member_role\(uid, p_organization_id\) is null/)
  const noPrices = read('../supabase/migrations/20261012080000_lab_customer_no_provider_prices.sql')
  for (const column of ['approved_budget_usd', 'max_hourly_usd', 'committed_max_cost_usd', 'teacher_reserved_usd', 'provider_reported_cost_usd']) {
    assert.match(noPrices, new RegExp(`drop column if exists ${column}`))
  }
  assert.match(noPrices, /drop table if exists lab\.teacher_rate_cards/)
  assert.match(noPrices, /drop table if exists lab\.training_rate_cards/)
  assert.match(noPrices, /release_customer_job_reservation[\s\S]*job_submission_state is distinct from 'reserved'/)
})
