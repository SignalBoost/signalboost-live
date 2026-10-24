import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

export type BuilderRunLimits = Readonly<{ maxCostNanodollars: number; maxElapsedMs: number }>
export type InferenceQuote = Readonly<{
  provider: 'deepinfra'; model: string; contextTokens: number; outputTokens: number
  inputNanosPerToken: number; outputNanosPerToken: number; upperNanodollars: number
  source: string; quotedAt: string
}>
export interface BuilderInferenceBudgetStore {
  reserve(callId: string, quote: InferenceQuote): Promise<void>
  settle(callId: string, accountedNanodollars: number | null, reportedNanodollars: number | null): Promise<void>
}
export class BuilderBudgetError extends Error {
  constructor(code: string) { super(code); this.name = 'BuilderBudgetError' }
}
const jobScope = new AsyncLocalStorage<string>()
export function withBuilderInferenceJob<T>(jobId: string, operation: () => T): T {
  if (!jobId || jobId.length > 120) throw new BuilderBudgetError('builder_job_correlation_invalid')
  return jobScope.run(jobId, operation)
}
export function builderInferenceCorrelation(): Readonly<{ correlationId?: string }> {
  const correlationId = jobScope.getStore()
  return correlationId ? { correlationId } : {}
}

const scope = new AsyncLocalStorage<{ store: BuilderInferenceBudgetStore; deadlineAt: number }>()
export const currentBuilderInferenceBudget = () => scope.getStore() ?? null
export function withBuilderInferenceBudget<T>(store: BuilderInferenceBudgetStore, deadlineAt: number, operation: () => T): T {
  if (!Number.isFinite(deadlineAt)) throw new BuilderBudgetError('builder_budget_deadline_invalid')
  return scope.run({ store, deadlineAt }, operation)
}
export function checkBuilderInferenceDeadline(now = Date.now()): void {
  const context = scope.getStore()
  if (context && now >= context.deadlineAt) throw new BuilderBudgetError('builder_budget_time_exhausted')
}

/** Dollar caps are converted to integers once; rounding can never increase the user's grant. */
export function readBuilderRunLimits(objective: string): BuilderRunLimits | null {
  const lines = String(objective || '').split(/\r?\n/)
  const limits = lines.filter(line => (/^\s*(?:limits?|budget|spend(?:ing)? (?:cap|limit))\s*:/i.test(line)
    || /\b(?:this (?:run|job|attempt)|inference (?:spend(?:ing)?|cost))\b/i.test(line))
    && /\b(?:max(?:imum)?|at most|under|no more than|cap|limit|budget|ceiling)\b/i.test(line))
  const amounts = limits.flatMap(line => [...line.matchAll(/\$\s*(\d+(?:\.\d+)?)|\b(\d+(?:\.\d+)?)\s*(?:USD|dollars?)\b/gi)].map(m => m[1] || m[2]))
  if (!amounts.length) return null
  const nanos = amounts.map(amount => {
    if (!/^\d+(?:\.\d{1,9})?$/.test(amount)) throw new BuilderBudgetError('builder_budget_amount_invalid')
    const [whole, fraction = ''] = amount.split('.')
    const value = Number(BigInt(whole) * BigInt(1_000_000_000) + BigInt(fraction.padEnd(9, '0')))
    if (!Number.isSafeInteger(value) || value <= 0 || value > 100_000_000_000) throw new BuilderBudgetError('builder_budget_amount_invalid')
    return value
  })
  // Multiple caps are conjunctive: the smallest wins. Never infer permission to raise one.
  const times = [...String(objective).matchAll(/(?:maximum|max(?:imum)?|at most|wall[- ]clock(?: limit)?[: ]*)\s+(\d+(?:\.\d+)?)\s*(seconds?|minutes?|hours?)/gi)]
    .map(m => Number(m[1]) * (/^second/i.test(m[2]) ? 1000 : /^minute/i.test(m[2]) ? 60000 : 3600000))
  const maxElapsedMs = Math.min(3_600_000, ...(times.length ? times : [600_000]))
  if (!Number.isSafeInteger(maxElapsedMs) || maxElapsedMs <= 0) throw new BuilderBudgetError('builder_budget_deadline_invalid')
  return { maxCostNanodollars: Math.min(...nanos), maxElapsedMs }
}

function nanoRate(cents: unknown): number {
  if (typeof cents !== 'number' || !Number.isFinite(cents) || cents < 0) throw new BuilderBudgetError('builder_budget_price_unavailable')
  return Math.ceil(cents * 10_000_000)
}
export function quoteDeepInfraRequest(endpoint: string, body: any, catalog: unknown, now = Date.now()): InferenceQuote {
  const url = new URL(endpoint)
  if (url.origin !== 'https://api.deepinfra.com' || url.pathname !== '/v1/openai/chat/completions' || url.search || url.username || url.password) {
    throw new BuilderBudgetError('builder_budget_provider_not_priced')
  }
  if (!body || typeof body.model !== 'string' || (body.n !== undefined && body.n !== 1) || body.stream === true
    || body.service_tier !== undefined || body.audio || body.modalities || body.prompt_cache_retention
    || !Array.isArray(body.messages) || body.messages.some((m: any) => m.content !== null && typeof m.content !== 'string')) {
    throw new BuilderBudgetError('builder_budget_request_not_priceable')
  }
  const entry = Array.isArray(catalog) ? catalog.find(m => m.model_name === body.model && m.type === 'text-generation') : null
  if (!entry || entry.pricing?.type !== 'tokens' || entry.private || entry.deprecated) throw new BuilderBudgetError('builder_budget_price_unavailable')
  const modelContextTokens = entry.max_tokens
  const outputTokens = body.max_tokens
  // Byte count conservatively bounds text tokens for byte-level tokenizers;
  // reserve additional room for message framing and provider overhead.
  const inputBytes = body.messages.reduce((sum: number, message: any) =>
    sum + Buffer.byteLength(JSON.stringify(message), 'utf8'), 0)
  const estimatedInputCeiling = inputBytes + body.messages.length * 1024 + 4096
  const contextTokens = Math.min(modelContextTokens, estimatedInputCeiling)
  if (!Number.isSafeInteger(contextTokens) || contextTokens <= 0 || !Number.isSafeInteger(outputTokens) || outputTokens <= 0 || outputTokens > modelContextTokens) {
    throw new BuilderBudgetError('builder_budget_token_bound_invalid')
  }
  // Reserve the entire provider-declared context, not a characters/4 token guess. Ignore
  // discounts and cached-input savings. Standard text-only requests have no image/tool fees.
  const inputNanosPerToken = nanoRate(entry.pricing.cents_per_input_token)
  const outputNanosPerToken = nanoRate(entry.pricing.cents_per_output_token)
  const upperNanodollars = contextTokens * inputNanosPerToken + outputTokens * outputNanosPerToken
  if (!Number.isSafeInteger(upperNanodollars) || upperNanodollars <= 0) throw new BuilderBudgetError('builder_budget_price_unavailable')
  return { provider: 'deepinfra', model: body.model, contextTokens, outputTokens, inputNanosPerToken, outputNanosPerToken, upperNanodollars,
    source: 'https://api.deepinfra.com/models/list', quotedAt: new Date(now).toISOString() }
}

/** Shared physical HTTP boundary: every retry/fallback is a new durable reservation. */
export function builderBudgetedModelFetch(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    const context = scope.getStore()
    if (!context) return fetchImpl(input, init)
    checkBuilderInferenceDeadline()
    const endpoint = String(input)
    if (!endpoint.startsWith('https://api.deepinfra.com/v1/openai/chat/completions')) throw new BuilderBudgetError('builder_budget_provider_not_priced')
    const deadlineSignal = AbortSignal.timeout(Math.max(1, context.deadlineAt - Date.now()))
    const signal = AbortSignal.any([deadlineSignal, ...(init?.signal ? [init.signal] : [])])
    let body: any
    try { body = JSON.parse(String(init?.body)) } catch { throw new BuilderBudgetError('builder_budget_request_not_priceable') }
    const prices = await fetchImpl('https://api.deepinfra.com/models/list', { signal, redirect: 'error' })
    if (!prices.ok) throw new BuilderBudgetError('builder_budget_price_unavailable')
    const quote = quoteDeepInfraRequest(endpoint, body, await prices.json())
    checkBuilderInferenceDeadline()
    const callId = randomUUID()
    await context.store.reserve(callId, quote)
    checkBuilderInferenceDeadline()
    // Unknown/lost responses retain the full reservation. Never refund based on a transport error.
    let response: Response
    try { response = await fetchImpl(input, { ...init, signal, redirect: 'error' }) }
    catch (error) {
      if (deadlineSignal.aborted) throw new BuilderBudgetError('builder_budget_time_exhausted')
      throw error
    }
    const payload = await response.clone().json().catch(() => null)
    const usage = payload?.usage
    const inputTokens = usage?.prompt_tokens
    const outputTokens = usage?.completion_tokens
    const reportedRaw = typeof usage?.estimated_cost === 'number' && Number.isFinite(usage.estimated_cost) && usage.estimated_cost >= 0
      ? Math.ceil(usage.estimated_cost * 1_000_000_000) : null
    const measuredRaw = Number.isSafeInteger(inputTokens) && inputTokens >= 0 && Number.isSafeInteger(outputTokens) && outputTokens >= 0
      ? inputTokens * quote.inputNanosPerToken + outputTokens * quote.outputNanosPerToken : null
    const reported = Number.isSafeInteger(reportedRaw) ? reportedRaw : null
    const measured = Number.isSafeInteger(measuredRaw) ? measuredRaw : null
    // Providers may report billable usage even on an error response. A ceiling breach
    // must disable the ledger regardless of HTTP status, never leave room for a retry.
    const maximumRecorded = Math.max(measured ?? 0, reported ?? 0)
    const accounted = maximumRecorded > quote.upperNanodollars ? maximumRecorded
      : response.ok && measured !== null && inputTokens <= quote.contextTokens && outputTokens <= quote.outputTokens
        ? maximumRecorded : null
    await context.store.settle(callId, accounted, reported)
    if ((reportedRaw !== null && reported === null) || (measuredRaw !== null && measured === null)) {
      throw new BuilderBudgetError('builder_budget_usage_invalid')
    }
    if (measured !== null && (inputTokens > quote.contextTokens || outputTokens > quote.outputTokens)) {
      throw new BuilderBudgetError('builder_budget_provider_token_bound_breached')
    }
    checkBuilderInferenceDeadline()
    return response
  }
}
