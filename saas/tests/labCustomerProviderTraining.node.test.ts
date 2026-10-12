// saas/tests/labCustomerProviderTraining.node.test.ts
// Together AI and Fireworks AI training connectors: every provider call is a fake fetch, so no network and no spend.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildChatJsonl, cancelProviderJob, datasetTokenBound, findFireworksJob, findTogetherJob, fireworksIds, fireworksRateCard, interpretFireworksJob, interpretTogetherJob,
  listFireworksBaseModels, listTogetherBaseModels, normalizeRateCards, prepareFireworks, prepareTogether, readProviderJob,
  resolveFireworksAccount, submitFireworks, submitTogether, type TrainingRateCard,
} from '../lib/ai/cos/labCustomerProviderTraining.ts'

type Call = { url: string; method: string; body: unknown }
function fakeFetch(routes: Array<[RegExp, (call: Call, n: number) => [number, unknown]]>) {
  const calls: Call[] = []
  const counts = new Map<RegExp, number>()
  const fetcher = async (url: string, init: RequestInit = {}) => {
    const call = { url, method: String(init.method ?? 'GET'), body: init.body }
    calls.push(call)
    const route = routes.find(([pattern]) => pattern.test(`${call.method} ${url}`))
    if (!route) throw new Error(`unexpected ${call.method} ${url}`)
    const n = (counts.get(route[0]) ?? 0) + 1
    counts.set(route[0], n)
    const [status, body] = route[1](call, n)
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }
  return { fetcher, calls }
}
const row = (i: number) => ({ promptId: `p${i}`, teacherId: 't', provider: 'x', model: 'm', prompt: `Question ${i}?`, response: `Answer ${i}.`, text: '', itemHash: `h${i}` })
const rows = Array.from({ length: 20 }, (_, i) => row(i))
const RUN = '11111111-2222-4333-8444-555555555555'
const CARDS: TrainingRateCard[] = normalizeRateCards([
  { id: 'c1', providerKind: 'fireworks', minParameters: 0, maxParameters: 16e9, usdPerMTok: 0.5, safetyMargin: 1.25 },
  { id: 'c2', providerKind: 'fireworks', minParameters: 16e9 + 1, maxParameters: 80e9, usdPerMTok: 3, safetyMargin: 1.25 },
])

test('dataset is chat JSONL and its byte count bounds billed tokens', () => {
  const jsonl = buildChatJsonl(rows.slice(0, 2))
  const lines = jsonl.trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(lines[0], { messages: [{ role: 'user', content: 'Question 0?' }, { role: 'assistant', content: 'Answer 0.' }] })
  assert.equal(datasetTokenBound('añ'), 3)
})

test('Together base models come from the live list and only carry a fine-tuning price', async () => {
  const { fetcher } = fakeFetch([[/GET https:\/\/api\.together\.xyz\/v1\/models$/, () => [200, [
    { id: 'Qwen/Qwen3-8B', type: 'chat', pricing: { finetune: 0.48 } },
    { id: 'meta-llama/Llama-3.3-70B', type: 'chat', pricing: { finetune: 0 } },
    { id: 'BAAI/bge-large', type: 'embedding', pricing: { finetune: 1 } },
  ]]]])
  assert.deepEqual(await listTogetherBaseModels('k', fetcher), [{ id: 'Qwen/Qwen3-8B', label: 'Qwen/Qwen3-8B' }])
})

test('Together preparation is free: limits, upload and price estimate, never a job', async () => {
  const { fetcher, calls } = fakeFetch([
    [/GET .*\/fine-tunes\/models\/limits\?model_name=Qwen%2FQwen3-8B$/, () => [200, { model_name: 'Qwen/Qwen3-8B' }]],
    [/POST .*\/files\/upload$/, () => [200, { id: 'file-1' }]],
    [/POST .*\/fine-tunes\/estimate-price$/, (_call, n) => n === 1
      ? [200, { estimation_available: false, unavailable_reason: 'train_file_not_validated' }]
      : [200, { estimation_available: true, estimated_total_price: 10, allowed_to_proceed: true }]],
  ])
  const prepared = await prepareTogether({ key: 'k', runId: RUN, baseModel: 'Qwen/Qwen3-8B', jsonl: buildChatJsonl(rows), fetcher, sleep: async () => undefined })
  assert.deepEqual(prepared, { fileId: 'file-1', estimateUsd: 10, maxCostUsd: 11 })
  assert.ok(!calls.some(call => /\/fine-tunes$/.test(call.url)), 'no paid job during preparation')
  const estimate = JSON.parse(String(calls.at(-1)!.body))
  assert.deepEqual(estimate, { training_file: 'file-1', model: 'Qwen/Qwen3-8B', n_epochs: 1 })
})

test('Together reservation never falls below the published per-job minimum, and refusals fail closed', async () => {
  const cheap = fakeFetch([
    [/limits/, () => [200, {}]], [/upload/, () => [200, { id: 'f' }]],
    [/estimate-price/, () => [200, { estimation_available: true, estimated_total_price: 0.2, allowed_to_proceed: true }]],
  ])
  assert.equal((await prepareTogether({ key: 'k', runId: RUN, baseModel: 'a/b', jsonl: 'x', fetcher: cheap.fetcher })).maxCostUsd, 4)
  const broke = fakeFetch([
    [/limits/, () => [200, {}]], [/upload/, () => [200, { id: 'f' }]],
    [/estimate-price/, () => [200, { estimation_available: true, estimated_total_price: 2, allowed_to_proceed: false }]],
  ])
  await assert.rejects(prepareTogether({ key: 'k', runId: RUN, baseModel: 'a/b', jsonl: 'x', fetcher: broke.fetcher }), /lab_provider_funds_insufficient/)
  const unknown = fakeFetch([[/limits/, () => [404, { error: 'not found' }]]])
  await assert.rejects(prepareTogether({ key: 'k', runId: RUN, baseModel: 'a/b', jsonl: 'x', fetcher: unknown.fetcher }), /lab_training_base_model_unsupported/)
  const invalid = fakeFetch([[/limits/, () => [200, {}]], [/upload/, () => [200, { id: 'f' }]],
    [/estimate-price/, () => [200, { estimation_available: false, unavailable_reason: 'train_file_invalid' }]]])
  await assert.rejects(prepareTogether({ key: 'k', runId: RUN, baseModel: 'a/b', jsonl: 'x', fetcher: invalid.fetcher }), /lab_provider_dataset_invalid/)
})

test('Together job creation: exact body, 4xx proves no job, 5xx cannot', async () => {
  const ok = fakeFetch([[/POST https:\/\/api\.together\.xyz\/v1\/fine-tunes$/, () => [200, { id: 'ft-123', status: 'pending' }]]])
  assert.deepEqual(await submitTogether({ key: 'k', runId: RUN, baseModel: 'Qwen/Qwen3-8B', fileId: 'file-1', fetcher: ok.fetcher }), { jobId: 'ft-123', jobUrl: null })
  assert.deepEqual(JSON.parse(String(ok.calls[0].body)), { model: 'Qwen/Qwen3-8B', training_file: 'file-1', n_epochs: 1, suffix: 'lab-11111111' })
  const rejected = fakeFetch([[/fine-tunes$/, () => [400, { error: 'bad' }]]])
  await assert.rejects(submitTogether({ key: 'k', runId: RUN, baseModel: 'a/b', fileId: 'f', fetcher: rejected.fetcher }), /lab_provider_job_rejected/)
  const lost = fakeFetch([[/fine-tunes$/, () => [503, {}]]])
  await assert.rejects(submitTogether({ key: 'k', runId: RUN, baseModel: 'a/b', fileId: 'f', fetcher: lost.fetcher }), /together_submit_unconfirmed/)
})

test('Fireworks account must be exactly one', async () => {
  const one = fakeFetch([[/\/v1\/accounts\?pageSize=10$/, () => [200, { accounts: [{ name: 'accounts/acme' }] }]]])
  assert.equal(await resolveFireworksAccount('k', one.fetcher), 'accounts/acme')
  const two = fakeFetch([[/\/v1\/accounts/, () => [200, { accounts: [{ name: 'accounts/a' }, { name: 'accounts/b' }] }]]])
  await assert.rejects(resolveFireworksAccount('k', two.fetcher), /lab_fireworks_account_unavailable/)
})

test('Fireworks price bands: inclusive edges, unknown sizes have no price, malformed cards are dropped', () => {
  assert.equal(fireworksRateCard(16e9, CARDS)?.id, 'c1')
  assert.equal(fireworksRateCard(16e9 + 1, CARDS)?.id, 'c2')
  assert.equal(fireworksRateCard(81e9, CARDS), null)
  assert.equal(fireworksRateCard(0, CARDS), null)
  assert.equal(normalizeRateCards([{ id: 'x', providerKind: 'fireworks', minParameters: 0, maxParameters: null, usdPerMTok: 0, safetyMargin: 1 }]).length, 0)
  assert.equal(normalizeRateCards('nope').length, 0)
})

test('Fireworks base models: live, LoRA-SFT tunable and priced only, across pages', async () => {
  const model = (id: string, params: number, tunable: boolean) => ({ name: `accounts/fireworks/models/${id}`, supervisedLoraTunable: tunable, baseModelDetails: { parameterCount: String(params) } })
  const { fetcher, calls } = fakeFetch([[/accounts\/fireworks\/models\?pageSize=200/, call => /pageToken=p2/.test(call.url)
    ? [200, { models: [model('qwen3-8b', 8e9, true)] }]
    : [200, { models: [model('big', 900e9, true), model('frozen', 7e9, false), model('llama-70b', 70e9, true)], nextPageToken: 'p2' }]]])
  const listed = await listFireworksBaseModels('k', CARDS, fetcher)
  assert.deepEqual(listed.map(m => m.id), ['accounts/fireworks/models/llama-70b', 'accounts/fireworks/models/qwen3-8b'])
  assert.equal(listed[1].label, 'qwen3-8b · 8.0B')
  assert.equal(calls.length, 2)
})

test('Fireworks preparation prices from the band before anything is created', async () => {
  const jsonl = buildChatJsonl(rows)
  const { fetcher, calls } = fakeFetch([
    [/\/v1\/accounts\?/, () => [200, { accounts: [{ name: 'accounts/acme' }] }]],
    [/GET https:\/\/api\.fireworks\.ai\/v1\/accounts\/fireworks\/models\/qwen3-8b$/, () => [200, { supervisedLoraTunable: true, baseModelDetails: { parameterCount: '8000000000' } }]],
  ])
  const prepared = await prepareFireworks({ key: 'k', baseModel: 'accounts/fireworks/models/qwen3-8b', jsonl, cards: CARDS, fetcher })
  const bytes = Buffer.byteLength(jsonl)
  assert.equal(prepared.tokenBound, bytes)
  assert.equal(prepared.maxCostUsd, Number((bytes / 1e6 * 0.5 * 1.25).toFixed(6)))
  assert.equal(prepared.rateCardId, 'c1')
  assert.ok(calls.every(call => call.method === 'GET'))
  const unpriced = fakeFetch([[/\/v1\/accounts\?/, () => [200, { accounts: [{ name: 'accounts/acme' }] }]], [/models\/huge$/, () => [200, { supervisedLoraTunable: true, baseModelDetails: { parameterCount: '500000000000' } }]]])
  await assert.rejects(prepareFireworks({ key: 'k', baseModel: 'accounts/fireworks/models/huge', jsonl, cards: CARDS, fetcher: unpriced.fetcher }), /lab_training_rate_unverified/)
  const frozen = fakeFetch([[/\/v1\/accounts\?/, () => [200, { accounts: [{ name: 'accounts/acme' }] }]], [/models\/frozen$/, () => [200, { supervisedLoraTunable: false }]]])
  await assert.rejects(prepareFireworks({ key: 'k', baseModel: 'accounts/fireworks/models/frozen', jsonl, cards: CARDS, fetcher: frozen.fetcher }), /lab_training_base_model_unsupported/)
})

test('Fireworks submission: dataset, upload, then a job with deterministic ids that can be found again', async () => {
  const ids = fireworksIds('accounts/acme', RUN)
  const { fetcher, calls } = fakeFetch([
    [/POST .*\/accounts\/acme\/datasets$/, () => [200, {}]],
    [/POST .*\/datasets\/lab-.*:upload$/, () => [200, { id: ids.datasetId }]],
    [/POST .*\/supervisedFineTuningJobs\?supervisedFineTuningJobId=lab-/, () => [200, { name: ids.job }]],
  ])
  const job = await submitFireworks({ key: 'k', runId: RUN, account: 'accounts/acme', baseModel: 'accounts/fireworks/models/qwen3-8b', jsonl: 'x\n', rows: 20, fetcher })
  assert.deepEqual(job, { jobId: ids.job, jobUrl: null })
  assert.deepEqual(calls.map(call => call.method), ['POST', 'POST', 'POST'])
  assert.deepEqual(JSON.parse(String(calls[2].body)), { dataset: ids.dataset, baseModel: 'accounts/fireworks/models/qwen3-8b', outputModel: ids.outputModel, epochs: 1, loraRank: 16 })
  const missing = fakeFetch([[/supervisedFineTuningJobs\/lab-/, () => [404, {}]]])
  assert.equal(await findFireworksJob({ key: 'k', runId: RUN, account: 'accounts/acme', fetcher: missing.fetcher }), null)
  const rejected = fakeFetch([[/datasets$/, () => [403, {}]]])
  await assert.rejects(submitFireworks({ key: 'k', runId: RUN, account: 'accounts/acme', baseModel: 'b', jsonl: 'x', rows: 20, fetcher: rejected.fetcher }), /lab_provider_job_rejected/)
})

test('provider job states map to running / completed / failed with the tuned model id', async () => {
  assert.deepEqual(interpretTogetherJob({ status: 'completed', model_output_name: 'me/Qwen3-8B-lab-1' }),
    { state: 'completed', progress: 100, tunedModelId: 'me/Qwen3-8B-lab-1', reportedCostUsd: null, detail: 'completed' })
  assert.equal(interpretTogetherJob({ status: 'error' }).state, 'failed')
  assert.equal(interpretTogetherJob({ status: 'running' }).state, 'running')
  const done = interpretFireworksJob({ state: 'JOB_STATE_COMPLETED', outputModel: 'accounts/acme/models/lab-1', estimatedCost: { currencyCode: 'USD', units: '1', nanos: 500000000 } })
  assert.equal(done.tunedModelId, 'accounts/acme/models/lab-1')
  assert.equal(done.reportedCostUsd, 1.5)
  assert.equal(interpretFireworksJob({ state: 'JOB_STATE_RUNNING', jobProgress: { percent: 140 } }).progress, 99)
  assert.equal(interpretFireworksJob({ state: 'JOB_STATE_FAILED', status: { message: 'oom' } }).detail, 'oom')
  await assert.rejects(readProviderJob({ kind: 'fireworks', key: 'k', jobId: '../../secrets', fetcher: async () => { throw new Error('must not fetch') } }), /lab_provider_job_id_invalid/)
  const together = fakeFetch([[/GET https:\/\/api\.together\.xyz\/v1\/fine-tunes\/ft-1$/, () => [200, { status: 'queued' }]]])
  assert.equal((await readProviderJob({ kind: 'together', key: 'k', jobId: 'ft-1', fetcher: together.fetcher })).detail, 'queued')
})

test('an unconfirmed Together creation is found again by its uploaded file and run suffix', async () => {
  const list = fakeFetch([[/GET https:\/\/api\.together\.xyz\/v1\/fine-tunes$/, () => [200, { data: [
    { id: 'ft-other', training_file: 'file-9', suffix: 'lab-11111111' },
    { id: 'ft-mine', training_file: 'file-1', suffix: 'lab-11111111' },
  ] }]]])
  assert.deepEqual(await findTogetherJob({ key: 'k', runId: RUN, fileId: 'file-1', fetcher: list.fetcher }), { jobId: 'ft-mine', jobUrl: null })
  const none = fakeFetch([[/fine-tunes$/, () => [200, { data: [] }]]])
  assert.equal(await findTogetherJob({ key: 'k', runId: RUN, fileId: 'file-1', fetcher: none.fetcher }), null)
  const down = fakeFetch([[/fine-tunes$/, () => [503, {}]]])
  await assert.rejects(findTogetherJob({ key: 'k', runId: RUN, fileId: 'file-1', fetcher: down.fetcher }), /together_find_unavailable/)
})

test('cancel stops the job at the provider and reports stopped only on provider evidence', async () => {
  const together = fakeFetch([
    [/POST https:\/\/api\.together\.xyz\/v1\/fine-tunes\/ft-1\/cancel$/, () => [200, { id: 'ft-1', status: 'cancel_requested' }]],
    [/GET https:\/\/api\.together\.xyz\/v1\/fine-tunes\/ft-1$/, () => [200, { status: 'cancelled' }]],
  ])
  assert.deepEqual(await cancelProviderJob({ kind: 'together', key: 'k', jobId: 'ft-1', fetcher: together.fetcher }), { stopped: true, detail: 'cancelled' })
  const stillRunning = fakeFetch([[/cancel$/, () => [200, { status: 'running' }]], [/ft-1$/, () => [200, { status: 'running' }]]])
  assert.equal((await cancelProviderJob({ kind: 'together', key: 'k', jobId: 'ft-1', fetcher: stillRunning.fetcher })).stopped, false)
  const job = 'accounts/acme/supervisedFineTuningJobs/lab-1'
  const fireworks = fakeFetch([
    [/DELETE https:\/\/api\.fireworks\.ai\/v1\/accounts\/acme\/supervisedFineTuningJobs\/lab-1$/, () => [200, {}]],
    [/GET https:\/\/api\.fireworks\.ai\/v1\/accounts\/acme\/supervisedFineTuningJobs\/lab-1$/, () => [404, {}]],
  ])
  assert.deepEqual(await cancelProviderJob({ kind: 'fireworks', key: 'k', jobId: job, fetcher: fireworks.fetcher }), { stopped: true, detail: 'deleted' })
  assert.deepEqual(fireworks.calls.map(call => call.method), ['DELETE', 'GET'])
  const fwRunning = fakeFetch([[/DELETE/, () => [200, {}]], [/GET/, () => [200, { state: 'JOB_STATE_RUNNING' }]]])
  assert.equal((await cancelProviderJob({ kind: 'fireworks', key: 'k', jobId: job, fetcher: fwRunning.fetcher })).stopped, false)
  const refused = fakeFetch([[/DELETE/, () => [500, {}]]])
  await assert.rejects(cancelProviderJob({ kind: 'fireworks', key: 'k', jobId: job, fetcher: refused.fetcher }), /lab_provider_cancel_unavailable/)
})

const route = readFileSync(new URL('../app/api/lab/training/route.ts', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../supabase/migrations/20261012050000_lab_customer_provider_training.sql', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')

test('route reserves the maximum cost before creating the paid job and keeps it when creation is unproven', () => {
  const start = route.slice(route.indexOf('async function startProviderJob'))
  assert.ok(start.indexOf("record('preparing_dataset', 35") < start.indexOf('job = await submit()'))
  assert.match(start, /if \(!\(maxCostUsd <= remainingBudgetUsd\)\) throw new Error\('lab_training_budget_insufficient'\)/)
  assert.match(start, /reason !== 'lab_provider_job_rejected'/)
  assert.match(start, /fail\('lab_provider_job_state_unknown', 202/)
})

test('migration keeps customer-only access and allows only connector-backed compute providers', () => {
  assert.match(sql, /check \(compute_provider_kind in \('huggingface','together','fireworks'\)\)/)
  assert.match(sql, /revoke all on lab\.training_rate_cards from public, anon, authenticated, service_role/)
  for (const fn of ['training_rate_cards', 'priced_teacher_models', 'open_model_directory_credential', 'create_training_run', 'open_run_compute', 'list_training_runs']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.itmounts_lab_customer_${fn}\\([^)]*\\) from public, anon, service_role`))
  }
  assert.doesNotMatch(sql, /grant [^;]* to service_role/)
  assert.doesNotMatch(sql, /^\s*(begin|commit);/m)
})

test('section 2 lists every provider alphabetically; only key-backed, capable providers are selectable', () => {
  assert.match(panel, /teacherOptions\.map\(item => <option key=\{item\.kind\} value=\{item\.kind\} disabled=\{item\.blocked !== null\}>/)
  assert.match(panel, /trainingOptions\.map\(item => <option key=\{item\.kind\} value=\{item\.kind\} disabled=\{item\.blocked !== null\}>/)
  assert.match(panel, /setComputeId\(onlyAccount\(event\.target\.value\)\)/)
  assert.match(panel, /setTeacherId\(onlyAccount\(event\.target\.value\)\)/)
  assert.match(panel, /<option key=\{model\.id\} value=\{model\.id\} disabled>/)
  assert.match(panel, /credentialId=\$\{encodeURIComponent\(computeId\)\}/)
  assert.doesNotMatch(panel, /hfOnly/)
})

test('route exposes provider cancel and reconciles unconfirmed Together jobs instead of leaving them untracked', () => {
  assert.match(route, /if \(body\?\.action === 'cancel'\) return cancel\(session, body\)/)
  assert.match(route, /find = \(\) => findTogetherJob\(\{ key, runId, fileId: prepared\.fileId, fetcher: fetch \}\)/)
  assert.match(route, /findTogetherJob\(\{ key, runId, fileId: opened\.providerFileRef, fetcher: fetch \}\)/)
  assert.match(route, /if \(!outcome\.stopped\) return fail\('lab_provider_cancel_pending', 409/)
  assert.match(sql, /'providerFileRef', r\.provider_file_ref/)
  assert.match(sql, /'training','completed','failed','cancelled'\) then/)
  assert.match(panel, /onClick=\{\(\) => cancelRun\(run\.runId\)\}>\{copy\.cancelTraining\}/)
})
