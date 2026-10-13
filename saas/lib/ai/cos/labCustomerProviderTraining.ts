// saas/lib/ai/cos/labCustomerProviderTraining.ts
//
// Customer LAB training on provider-hosted fine-tuning APIs, with the CUSTOMER's own key and account:
//   Together AI  -> POST /v1/files/upload, /v1/fine-tunes/estimate-price (readiness only), /v1/fine-tunes, GET /v1/fine-tunes/{id}
//   Fireworks AI -> /v1/accounts, /v1/{account}/datasets(+:upload), /v1/{account}/supervisedFineTuningJobs
// Endpoints and fields follow each provider's own API reference (docs.together.ai, docs.fireworks.ai, read 2026-10-12).
//
// The provider bills the customer directly; the platform never prices the job. Order is the same as the Hugging Face
// path: validation and upload first, then the job's identifying details are recorded in the database, then the job is
// created. A job whose creation cannot be proven absent stays recorded so "Check status" can find it.
// Pure orchestration with an injected fetch, so every rule is unit-tested without network.
import type { TeacherRow } from './labCustomerTraining.ts'

export type ProviderTrainingKind = 'together' | 'fireworks'
export const PROVIDER_TRAINING_KINDS: readonly ProviderTrainingKind[] = Object.freeze(['together', 'fireworks'])
export const isProviderTrainingKind = (kind: string): kind is ProviderTrainingKind => (PROVIDER_TRAINING_KINDS as readonly string[]).includes(kind)

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>
export type BaseModelOption = Readonly<{ id: string; label: string }>

const TOGETHER = 'https://api.together.xyz/v1'
const FIREWORKS = 'https://api.fireworks.ai/v1'
// One pass over the data. Together and Fireworks both default to LoRA when no full-training option is sent.
const EPOCHS = 1
const FIREWORKS_LORA_RANK = 16
const READINESS_ATTEMPTS = 8
const TIMEOUT_MS = 20_000

const fail = (code: string): never => { throw new Error(code) }
const auth = (key: string) => ({ authorization: `Bearer ${key}`, accept: 'application/json' })
const MODEL_ID = /^[\w./:-]{1,240}$/

async function json(fetcher: Fetcher, url: string, init: RequestInit, failure: string): Promise<{ status: number; body: any }> {
  let response: Response
  try { response = await fetcher(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS), ...init }) }
  catch { return fail(`${failure}_unreachable`) }
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}

// --- Dataset -----------------------------------------------------------------------------------------------------
/** Chat JSONL accepted by both providers: one {"messages":[user, assistant]} object per line. */
export function buildChatJsonl(rows: readonly TeacherRow[]): string {
  return rows.map(row => JSON.stringify({ messages: [{ role: 'user', content: row.prompt }, { role: 'assistant', content: row.response }] })).join('\n') + '\n'
}

// --- Together AI -------------------------------------------------------------------------------------------------
/** Base models Together lists as fine-tunable (they carry a fine-tuning entry), from the customer's own live model list. */
export async function listTogetherBaseModels(key: string, fetcher: Fetcher): Promise<BaseModelOption[]> {
  const { status, body } = await json(fetcher, `${TOGETHER}/models`, { headers: auth(key) }, 'together_models')
  if (status !== 200 || !Array.isArray(body)) fail('together_models_unavailable')
  const ids: string[] = body.filter((m: any) => (m?.type === 'chat' || m?.type === 'language') && Number(m?.pricing?.finetune) > 0 && MODEL_ID.test(String(m?.id ?? '')))
    .map((m: any) => String(m.id))
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b)).map(id => ({ id, label: id }))
}

export type TogetherPrepared = Readonly<{ fileId: string }>
/**
 * Before the job: confirm the model is tunable, upload the file, and wait until Together has validated it and says the
 * account may proceed. Together's pre-flight endpoint is used ONLY for that readiness answer; its price is ignored.
 */
export async function prepareTogether(input: {
  key: string; runId: string; baseModel: string; jsonl: string; fetcher: Fetcher; sleep?: (ms: number) => Promise<void>
}): Promise<TogetherPrepared> {
  const { key, fetcher } = input
  const sleep = input.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)))
  const limits = await json(fetcher, `${TOGETHER}/fine-tunes/models/limits?model_name=${encodeURIComponent(input.baseModel)}`, { headers: auth(key) }, 'together_limits')
  if (limits.status === 404) fail('lab_training_base_model_unsupported')
  if (limits.status !== 200) fail('together_limits_unavailable')
  const form = new FormData()
  form.append('file', new Blob([input.jsonl], { type: 'application/jsonl' }), `lab-${input.runId}.jsonl`)
  form.append('file_name', `lab-${input.runId}.jsonl`)
  form.append('purpose', 'fine-tune')
  form.append('file_type', 'jsonl')
  const upload = await json(fetcher, `${TOGETHER}/files/upload`, { method: 'POST', headers: auth(key), body: form }, 'together_upload')
  const fileId = String(upload.body?.id ?? '')
  if (upload.status !== 200 || !fileId) fail('together_upload_failed')
  // Together validates an uploaded file asynchronously; its pre-flight answers only once validation is done.
  for (let attempt = 0; attempt < READINESS_ATTEMPTS; attempt++) {
    const preflight = await json(fetcher, `${TOGETHER}/fine-tunes/estimate-price`, {
      method: 'POST', headers: { ...auth(key), 'content-type': 'application/json' },
      body: JSON.stringify({ training_file: fileId, model: input.baseModel, n_epochs: EPOCHS }),
    }, 'together_preflight')
    if (preflight.status !== 200) fail('lab_provider_not_ready')
    if (preflight.body?.estimation_available === true) {
      if (preflight.body.allowed_to_proceed !== true) fail('lab_provider_funds_insufficient')
      return Object.freeze({ fileId })
    }
    const reason = String(preflight.body?.unavailable_reason ?? '')
    if (reason !== 'train_file_not_validated') fail(reason === 'train_file_invalid' ? 'lab_provider_dataset_invalid' : 'lab_provider_not_ready')
    await sleep(3_000)
  }
  return fail('lab_provider_not_ready')
}

/** Creates the job. Only called after the run's job details are recorded. */
export async function submitTogether(input: { key: string; runId: string; baseModel: string; fileId: string; fetcher: Fetcher }): Promise<{ jobId: string; jobUrl: string | null }> {
  const created = await json(input.fetcher, `${TOGETHER}/fine-tunes`, {
    method: 'POST', headers: { ...auth(input.key), 'content-type': 'application/json' },
    body: JSON.stringify({ model: input.baseModel, training_file: input.fileId, n_epochs: EPOCHS, suffix: `lab-${input.runId.slice(0, 8)}` }),
  }, 'together_submit')
  const jobId = String(created.body?.id ?? '')
  // 4xx = Together refused the request, so no job exists. Anything else cannot prove absence.
  if (created.status >= 400 && created.status < 500) fail('lab_provider_job_rejected')
  if (created.status !== 200 || !jobId) fail('together_submit_unconfirmed')
  return { jobId, jobUrl: null }
}

/** Finds the job created from this run's uploaded file after an unconfirmed submit. null = provably absent. */
export async function findTogetherJob(input: { key: string; runId: string; fileId: string; fetcher: Fetcher }): Promise<{ jobId: string; jobUrl: string | null } | null> {
  const { status, body } = await json(input.fetcher, `${TOGETHER}/fine-tunes`, { headers: auth(input.key) }, 'together_find')
  if (status !== 200 || !Array.isArray(body?.data)) fail('together_find_unavailable')
  const suffix = `lab-${input.runId.slice(0, 8)}`
  const job = body.data.find((j: any) => String(j?.training_file ?? '') === input.fileId &&
    (!j?.suffix || String(j.suffix) === suffix) && /^[\w-]{1,120}$/.test(String(j?.id ?? '')))
  return job ? { jobId: String(job.id), jobUrl: null } : null
}

// --- Fireworks AI ------------------------------------------------------------------------------------------------
/** The single account this API key belongs to ("accounts/<id>"). Refuses to guess when several are visible. */
export async function resolveFireworksAccount(key: string, fetcher: Fetcher): Promise<string> {
  const { status, body } = await json(fetcher, `${FIREWORKS}/accounts?pageSize=10`, { headers: auth(key) }, 'fireworks_accounts')
  if (status !== 200 || !Array.isArray(body?.accounts)) fail('lab_fireworks_account_unavailable')
  const names = body.accounts.map((a: any) => String(a?.name ?? '')).filter((n: string) => /^accounts\/[a-z0-9-]+$/.test(n))
  if (names.length !== 1) fail('lab_fireworks_account_unavailable')
  return names[0]
}

const fireworksParameters = (model: any) => Number(model?.baseModelDetails?.parameterCount ?? 0)
const fireworksLoraTunable = (model: any) => model?.supervisedLoraTunable === true

/** Fireworks public base models that support LoRA SFT, read live with the customer's key. */
export async function listFireworksBaseModels(key: string, fetcher: Fetcher): Promise<BaseModelOption[]> {
  const out: BaseModelOption[] = []
  let pageToken = ''
  for (let page = 0; page < 5; page++) {
    const url = `${FIREWORKS}/accounts/fireworks/models?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const { status, body } = await json(fetcher, url, { headers: auth(key) }, 'fireworks_models')
    if (status !== 200 || !Array.isArray(body?.models)) fail('fireworks_models_unavailable')
    for (const model of body.models) {
      const name = String(model?.name ?? '')
      const parameters = fireworksParameters(model)
      if (!/^accounts\/fireworks\/models\/[A-Za-z0-9_.-]+$/.test(name) || !fireworksLoraTunable(model)) continue
      out.push({ id: name, label: parameters > 0 ? `${name.split('/').pop()} · ${(parameters / 1e9).toFixed(1)}B` : String(name.split('/').pop()) })
    }
    pageToken = String(body.nextPageToken ?? '')
    if (!pageToken) break
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

export type FireworksPrepared = Readonly<{ account: string }>
/** Before the job: find the account and confirm the base model supports LoRA SFT. */
export async function prepareFireworks(input: { key: string; baseModel: string; fetcher: Fetcher }): Promise<FireworksPrepared> {
  const account = await resolveFireworksAccount(input.key, input.fetcher)
  const model = await json(input.fetcher, `${FIREWORKS}/${input.baseModel}`, { headers: auth(input.key) }, 'fireworks_model')
  if (model.status === 404) fail('lab_training_base_model_unsupported')
  if (model.status !== 200) fail('fireworks_model_unavailable')
  if (!fireworksLoraTunable(model.body)) fail('lab_training_base_model_unsupported')
  return Object.freeze({ account })
}

/** Deterministic resource ids, so a job whose creation response was lost can be found again. */
export const fireworksIds = (account: string, runId: string) => ({
  datasetId: `lab-${runId}`, jobId: `lab-${runId}`,
  dataset: `${account}/datasets/lab-${runId}`, job: `${account}/supervisedFineTuningJobs/lab-${runId}`, outputModel: `${account}/models/lab-${runId}`,
})

/** Paid step (dataset storage + job). Only called after the reservation is saved. */
export async function submitFireworks(input: {
  key: string; runId: string; account: string; baseModel: string; jsonl: string; rows: number; fetcher: Fetcher
}): Promise<{ jobId: string; jobUrl: string | null }> {
  const ids = fireworksIds(input.account, input.runId)
  const headers = { ...auth(input.key), 'content-type': 'application/json' }
  const dataset = await json(input.fetcher, `${FIREWORKS}/${input.account}/datasets`, {
    method: 'POST', headers,
    body: JSON.stringify({ datasetId: ids.datasetId, dataset: { displayName: ids.datasetId, exampleCount: String(input.rows), userUploaded: {}, format: 'CHAT' } }),
  }, 'fireworks_dataset')
  if (dataset.status !== 200 && dataset.status !== 409) fail('lab_provider_job_rejected')
  const form = new FormData()
  form.append('file', new Blob([input.jsonl], { type: 'application/jsonl' }), `${ids.datasetId}.jsonl`)
  const upload = await json(input.fetcher, `${FIREWORKS}/${ids.dataset}:upload`, { method: 'POST', headers: auth(input.key), body: form }, 'fireworks_upload')
  if (upload.status !== 200) fail('lab_provider_job_rejected')
  const created = await json(input.fetcher, `${FIREWORKS}/${input.account}/supervisedFineTuningJobs?supervisedFineTuningJobId=${ids.jobId}`, {
    method: 'POST', headers,
    body: JSON.stringify({ dataset: ids.dataset, baseModel: input.baseModel, outputModel: ids.outputModel, epochs: EPOCHS, loraRank: FIREWORKS_LORA_RANK }),
  }, 'fireworks_submit')
  if (created.status >= 400 && created.status < 500 && created.status !== 409) fail('lab_provider_job_rejected')
  if (created.status !== 200 && created.status !== 409) fail('fireworks_submit_unconfirmed')
  return { jobId: ids.job, jobUrl: null }
}

/** Looks the deterministic job up after an unconfirmed submit. null = provably absent. */
export async function findFireworksJob(input: { key: string; runId: string; account: string; fetcher: Fetcher }): Promise<{ jobId: string; jobUrl: string | null } | null> {
  const ids = fireworksIds(input.account, input.runId)
  const found = await json(input.fetcher, `${FIREWORKS}/${ids.job}`, { headers: auth(input.key) }, 'fireworks_find')
  if (found.status === 404) return null
  if (found.status !== 200) fail('fireworks_find_unavailable')
  return { jobId: ids.job, jobUrl: null }
}

// --- Status --------------------------------------------------------------------------------------------------------
export type ProviderJobState = Readonly<{
  state: 'running' | 'completed' | 'failed'; progress: number | null; tunedModelId: string | null; detail: string
}>

const TOGETHER_FAILED = new Set(['error', 'cancelled', 'cancel_requested'])
export function interpretTogetherJob(body: any): ProviderJobState {
  const status = String(body?.status ?? '').toLowerCase()
  if (status === 'completed') {
    const tuned = String(body?.model_object_name ?? body?.model_output_name ?? '')
    return { state: 'completed', progress: 100, tunedModelId: MODEL_ID.test(tuned) ? tuned : null, detail: 'completed' }
  }
  if (TOGETHER_FAILED.has(status)) return { state: 'failed', progress: null, tunedModelId: null, detail: status }
  return { state: 'running', progress: null, tunedModelId: null, detail: status || 'unknown' }
}

const FIREWORKS_FAILED = new Set(['JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED', 'JOB_STATE_DELETED', 'JOB_STATE_CANCELLING'])
export function interpretFireworksJob(body: any): ProviderJobState {
  const state = String(body?.state ?? '')
  if (state === 'JOB_STATE_COMPLETED') {
    const tuned = String(body?.outputModel ?? '')
    return { state: 'completed', progress: 100, tunedModelId: MODEL_ID.test(tuned) ? tuned : null, detail: 'completed' }
  }
  if (FIREWORKS_FAILED.has(state)) return { state: 'failed', progress: null, tunedModelId: null, detail: String(body?.status?.message ?? state).slice(0, 160) }
  const percent = Number(body?.jobProgress?.percent)
  return { state: 'running', progress: Number.isFinite(percent) ? Math.max(0, Math.min(99, Math.round(percent))) : null, tunedModelId: null, detail: state.replace(/^JOB_STATE_/, '').toLowerCase() || 'unknown' }
}

// --- Cancellation ----------------------------------------------------------------------------------------------------
export type CancelOutcome = Readonly<{ stopped: boolean; detail: string }>
/**
 * Asks the provider to stop the job, then reads it back: "stopped" is reported only when the provider itself shows a
 * terminal state or no longer has the job. Safe to repeat.
 *   Together  -> POST /v1/fine-tunes/{id}/cancel (documented cancel).
 *   Fireworks -> DELETE the supervised fine-tuning job (its API documents delete, no separate cancel), then GET it.
 */
export async function cancelProviderJob(input: { kind: ProviderTrainingKind; key: string; jobId: string; fetcher: Fetcher }): Promise<CancelOutcome> {
  if (input.kind === 'together') {
    if (!/^[\w-]{1,120}$/.test(input.jobId)) fail('lab_provider_job_id_invalid')
    const cancelled = await json(input.fetcher, `${TOGETHER}/fine-tunes/${input.jobId}/cancel`, { method: 'POST', headers: auth(input.key) }, 'together_cancel')
    if (cancelled.status === 404) return { stopped: true, detail: 'not_found' }
    if (cancelled.status !== 200 && cancelled.status !== 400) fail('lab_provider_cancel_unavailable')
    const job = await readProviderJob(input)
    const status = String(cancelled.body?.status ?? '')
    if (job.state !== 'running' || status === 'cancelled') return { stopped: true, detail: job.state === 'running' ? 'cancelled' : job.detail }
    return { stopped: false, detail: job.detail }
  }
  if (!/^accounts\/[a-z0-9-]+\/supervisedFineTuningJobs\/[A-Za-z0-9-]+$/.test(input.jobId)) fail('lab_provider_job_id_invalid')
  const deleted = await json(input.fetcher, `${FIREWORKS}/${input.jobId}`, { method: 'DELETE', headers: auth(input.key) }, 'fireworks_cancel')
  if (deleted.status !== 200 && deleted.status !== 404) fail('lab_provider_cancel_unavailable')
  const after = await json(input.fetcher, `${FIREWORKS}/${input.jobId}`, { headers: auth(input.key) }, 'fireworks_job')
  if (after.status === 404) return { stopped: true, detail: 'deleted' }
  if (after.status !== 200) fail('lab_provider_status_unavailable')
  const state = String(after.body?.state ?? '')
  const stopped = FIREWORKS_FAILED.has(state) || state === 'JOB_STATE_COMPLETED' || state === 'JOB_STATE_DELETING' || state === 'JOB_STATE_DELETING_CLEANING_UP'
  return { stopped, detail: state.replace(/^JOB_STATE_/, '').toLowerCase() || 'unknown' }
}

export async function readProviderJob(input: { kind: ProviderTrainingKind; key: string; jobId: string; fetcher: Fetcher }): Promise<ProviderJobState> {
  if (input.kind === 'together') {
    if (!/^[\w-]{1,120}$/.test(input.jobId)) fail('lab_provider_job_id_invalid')
    const { status, body } = await json(input.fetcher, `${TOGETHER}/fine-tunes/${input.jobId}`, { headers: auth(input.key) }, 'together_job')
    if (status !== 200) fail('lab_provider_status_unavailable')
    return interpretTogetherJob(body)
  }
  if (!/^accounts\/[a-z0-9-]+\/supervisedFineTuningJobs\/[A-Za-z0-9-]+$/.test(input.jobId)) fail('lab_provider_job_id_invalid')
  const { status, body } = await json(input.fetcher, `${FIREWORKS}/${input.jobId}`, { headers: auth(input.key) }, 'fireworks_job')
  if (status !== 200) fail('lab_provider_status_unavailable')
  return interpretFireworksJob(body)
}
