// saas/lib/ai/cos/labCustomerProviderTraining.ts
//
// Customer LAB training on provider-hosted fine-tuning APIs, with the CUSTOMER's own key and account:
//   Together AI  -> POST /v1/files/upload, /v1/fine-tunes/estimate-price, /v1/fine-tunes, GET /v1/fine-tunes/{id}
//   Fireworks AI -> /v1/accounts, /v1/{account}/datasets(+:upload), /v1/{account}/supervisedFineTuningJobs
// Endpoints and fields follow each provider's own API reference (docs.together.ai, docs.fireworks.ai, read 2026-10-12).
//
// Spend order is the same as the Hugging Face path: everything free first (validation, upload, price), then the run's
// maximum cost is RESERVED in the database, then the paid job is created. A job whose creation cannot be proven absent
// keeps its reservation. Pure orchestration with an injected fetch, so every rule is unit-tested without network.
import type { TeacherRow } from './labCustomerTraining.ts'

export type ProviderTrainingKind = 'together' | 'fireworks'
export const PROVIDER_TRAINING_KINDS: readonly ProviderTrainingKind[] = Object.freeze(['together', 'fireworks'])
export const isProviderTrainingKind = (kind: string): kind is ProviderTrainingKind => (PROVIDER_TRAINING_KINDS as readonly string[]).includes(kind)

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>
export type BaseModelOption = Readonly<{ id: string; label: string }>
/** Fireworks LoRA SFT price band, from lab.training_rate_cards (platform-maintained, provider-published prices). */
export type TrainingRateCard = Readonly<{ id: string; providerKind: string; minParameters: number; maxParameters: number | null; usdPerMTok: number; safetyMargin: number }>

const TOGETHER = 'https://api.together.xyz/v1'
const FIREWORKS = 'https://api.fireworks.ai/v1'
// One pass over the data. Together and Fireworks both default to LoRA when no full-training option is sent.
const EPOCHS = 1
const FIREWORKS_LORA_RANK = 16
// Together publishes a minimum charge per fine-tuning job (docs.together.ai/docs/fine-tuning/pricing): never reserve less.
const TOGETHER_MINIMUM_JOB_USD = 4
// Headroom over the provider's own estimate for rounding/surcharges. The provider estimate itself is the price source.
const TOGETHER_ESTIMATE_MARGIN = 1.1
const ESTIMATE_ATTEMPTS = 8
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
/** UTF-8 bytes of the dataset. A tokenizer token is at least one byte and the JSON keys outweigh any chat template, so
 *  the byte count is a safe upper bound on billed training tokens per epoch. */
export const datasetTokenBound = (jsonl: string) => Buffer.byteLength(jsonl, 'utf8')

// --- Together AI -------------------------------------------------------------------------------------------------
/** Base models with a Together fine-tuning price, from the customer's own live model list. */
export async function listTogetherBaseModels(key: string, fetcher: Fetcher): Promise<BaseModelOption[]> {
  const { status, body } = await json(fetcher, `${TOGETHER}/models`, { headers: auth(key) }, 'together_models')
  if (status !== 200 || !Array.isArray(body)) fail('together_models_unavailable')
  const ids: string[] = body.filter((m: any) => (m?.type === 'chat' || m?.type === 'language') && Number(m?.pricing?.finetune) > 0 && MODEL_ID.test(String(m?.id ?? '')))
    .map((m: any) => String(m.id))
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b)).map(id => ({ id, label: id }))
}

export type TogetherPrepared = Readonly<{ fileId: string; estimateUsd: number; maxCostUsd: number }>
/** Free steps: confirm the model is tunable, upload the file, get Together's own price estimate. */
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
  // The estimate is only available once Together has validated the uploaded file.
  for (let attempt = 0; attempt < ESTIMATE_ATTEMPTS; attempt++) {
    const estimate = await json(fetcher, `${TOGETHER}/fine-tunes/estimate-price`, {
      method: 'POST', headers: { ...auth(key), 'content-type': 'application/json' },
      body: JSON.stringify({ training_file: fileId, model: input.baseModel, n_epochs: EPOCHS }),
    }, 'together_estimate')
    if (estimate.status !== 200) fail('lab_provider_estimate_unavailable')
    if (estimate.body?.estimation_available === true) {
      const estimateUsd = Number(estimate.body.estimated_total_price)
      if (!(estimateUsd >= 0) || !Number.isFinite(estimateUsd)) fail('lab_provider_estimate_unavailable')
      if (estimate.body.allowed_to_proceed !== true) fail('lab_provider_funds_insufficient')
      const maxCostUsd = Number(Math.max(estimateUsd * TOGETHER_ESTIMATE_MARGIN, TOGETHER_MINIMUM_JOB_USD).toFixed(6))
      return Object.freeze({ fileId, estimateUsd, maxCostUsd })
    }
    const reason = String(estimate.body?.unavailable_reason ?? '')
    if (reason !== 'train_file_not_validated') fail(reason === 'train_file_invalid' ? 'lab_provider_dataset_invalid' : 'lab_provider_estimate_unavailable')
    await sleep(3_000)
  }
  return fail('lab_provider_estimate_unavailable')
}

/** Paid step. Only called after the reservation is saved. */
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

// --- Fireworks AI ------------------------------------------------------------------------------------------------
/** The single account this API key belongs to ("accounts/<id>"). Refuses to guess when several are visible. */
export async function resolveFireworksAccount(key: string, fetcher: Fetcher): Promise<string> {
  const { status, body } = await json(fetcher, `${FIREWORKS}/accounts?pageSize=10`, { headers: auth(key) }, 'fireworks_accounts')
  if (status !== 200 || !Array.isArray(body?.accounts)) fail('lab_fireworks_account_unavailable')
  const names = body.accounts.map((a: any) => String(a?.name ?? '')).filter((n: string) => /^accounts\/[a-z0-9-]+$/.test(n))
  if (names.length !== 1) fail('lab_fireworks_account_unavailable')
  return names[0]
}

/** Rows from itmounts_lab_customer_training_rate_cards, with every number checked. Malformed rows are dropped. */
export function normalizeRateCards(raw: unknown): TrainingRateCard[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((row: any) => {
    const card = {
      id: String(row?.id ?? ''), providerKind: String(row?.providerKind ?? ''),
      minParameters: Number(row?.minParameters), maxParameters: row?.maxParameters === null || row?.maxParameters === undefined ? null : Number(row.maxParameters),
      usdPerMTok: Number(row?.usdPerMTok), safetyMargin: Number(row?.safetyMargin),
    }
    const ok = card.id && card.providerKind && card.minParameters >= 0 && (card.maxParameters === null || card.maxParameters >= card.minParameters) &&
      card.usdPerMTok > 0 && card.safetyMargin >= 1
    return ok ? [Object.freeze(card)] : []
  })
}

export function fireworksRateCard(parameters: number, cards: readonly TrainingRateCard[]): TrainingRateCard | null {
  if (!(parameters > 0)) return null
  return cards.find(card => card.providerKind === 'fireworks' && parameters >= card.minParameters &&
    (card.maxParameters === null || parameters <= card.maxParameters)) ?? null
}

const fireworksParameters = (model: any) => Number(model?.baseModelDetails?.parameterCount ?? 0)
const fireworksLoraTunable = (model: any) => model?.supervisedLoraTunable === true

/** Fireworks public base models that support LoRA SFT AND fall in a priced band, read live with the customer's key. */
export async function listFireworksBaseModels(key: string, cards: readonly TrainingRateCard[], fetcher: Fetcher): Promise<BaseModelOption[]> {
  const out: BaseModelOption[] = []
  let pageToken = ''
  for (let page = 0; page < 5; page++) {
    const url = `${FIREWORKS}/accounts/fireworks/models?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const { status, body } = await json(fetcher, url, { headers: auth(key) }, 'fireworks_models')
    if (status !== 200 || !Array.isArray(body?.models)) fail('fireworks_models_unavailable')
    for (const model of body.models) {
      const name = String(model?.name ?? '')
      const parameters = fireworksParameters(model)
      if (!/^accounts\/fireworks\/models\/[A-Za-z0-9_.-]+$/.test(name) || !fireworksLoraTunable(model) || !fireworksRateCard(parameters, cards)) continue
      out.push({ id: name, label: `${name.split('/').pop()} · ${(parameters / 1e9).toFixed(1)}B` })
    }
    pageToken = String(body.nextPageToken ?? '')
    if (!pageToken) break
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

export type FireworksPrepared = Readonly<{ account: string; parameters: number; rateCardId: string; tokenBound: number; maxCostUsd: number }>
/** Free steps: find the account, confirm the base model supports LoRA SFT, price the run from its size band. */
export async function prepareFireworks(input: {
  key: string; baseModel: string; jsonl: string; cards: readonly TrainingRateCard[]; fetcher: Fetcher
}): Promise<FireworksPrepared> {
  const account = await resolveFireworksAccount(input.key, input.fetcher)
  const model = await json(input.fetcher, `${FIREWORKS}/${input.baseModel}`, { headers: auth(input.key) }, 'fireworks_model')
  if (model.status === 404) fail('lab_training_base_model_unsupported')
  if (model.status !== 200) fail('fireworks_model_unavailable')
  if (!fireworksLoraTunable(model.body)) fail('lab_training_base_model_unsupported')
  const parameters = fireworksParameters(model.body)
  const card = fireworksRateCard(parameters, input.cards)
  if (!card) fail('lab_training_rate_unverified')
  const tokenBound = datasetTokenBound(input.jsonl) * EPOCHS
  const maxCostUsd = Number((tokenBound / 1e6 * card!.usdPerMTok * card!.safetyMargin).toFixed(6))
  return Object.freeze({ account, parameters, rateCardId: card!.id, tokenBound, maxCostUsd })
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
  state: 'running' | 'completed' | 'failed'; progress: number | null; tunedModelId: string | null
  reportedCostUsd: number | null; detail: string
}>

const TOGETHER_FAILED = new Set(['error', 'cancelled', 'cancel_requested'])
export function interpretTogetherJob(body: any): ProviderJobState {
  const status = String(body?.status ?? '').toLowerCase()
  if (status === 'completed') {
    const tuned = String(body?.model_object_name ?? body?.model_output_name ?? '')
    return { state: 'completed', progress: 100, tunedModelId: MODEL_ID.test(tuned) ? tuned : null, reportedCostUsd: null, detail: 'completed' }
  }
  if (TOGETHER_FAILED.has(status)) return { state: 'failed', progress: null, tunedModelId: null, reportedCostUsd: null, detail: status }
  return { state: 'running', progress: null, tunedModelId: null, reportedCostUsd: null, detail: status || 'unknown' }
}

const FIREWORKS_FAILED = new Set(['JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED', 'JOB_STATE_DELETED', 'JOB_STATE_CANCELLING'])
const money = (value: any): number | null => {
  if (!value || String(value.currencyCode ?? 'USD') !== 'USD') return null
  const usd = Number(value.units ?? 0) + Number(value.nanos ?? 0) / 1e9
  return Number.isFinite(usd) && usd >= 0 ? Number(usd.toFixed(6)) : null
}
export function interpretFireworksJob(body: any): ProviderJobState {
  const state = String(body?.state ?? '')
  const cost = money(body?.estimatedCost)
  if (state === 'JOB_STATE_COMPLETED') {
    const tuned = String(body?.outputModel ?? '')
    return { state: 'completed', progress: 100, tunedModelId: MODEL_ID.test(tuned) ? tuned : null, reportedCostUsd: cost, detail: 'completed' }
  }
  if (FIREWORKS_FAILED.has(state)) return { state: 'failed', progress: null, tunedModelId: null, reportedCostUsd: cost, detail: String(body?.status?.message ?? state).slice(0, 160) }
  const percent = Number(body?.jobProgress?.percent)
  return { state: 'running', progress: Number.isFinite(percent) ? Math.max(0, Math.min(99, Math.round(percent))) : null, tunedModelId: null, reportedCostUsd: cost, detail: state.replace(/^JOB_STATE_/, '').toLowerCase() || 'unknown' }
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
