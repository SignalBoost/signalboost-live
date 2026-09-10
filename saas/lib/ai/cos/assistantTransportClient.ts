import {
  ASSISTANT_TRANSPORT_TIMEOUT_COPY,
  findRecoveredAssistantReply,
  type StoredAssistantMessage,
} from './assistantTransportRecovery.ts'
import {
  isReadOnlyKnowledgePrompt,
  payloadRequestsAdaptiveResearch,
} from './adaptiveResearchPolicy.ts'

export const ASSISTANT_TRANSPORT_ERROR_MARKERS = [
  'failed to fetch',
  'networkerror when attempting to fetch resource',
  'load failed',
  'the operation was aborted',
  'aborterror',
  'timeout',
] as const

const DEFAULT_PRIMARY_RESPONSE_BUDGET_MS = 30_000
const ADAPTIVE_RESEARCH_CLIENT_BUDGET_MS = 35_000

export type AssistantTransportLocale = keyof typeof ASSISTANT_TRANSPORT_TIMEOUT_COPY

export type AssistantSendResult =
  | { ok: true; source: 'live'; content: string; raw?: unknown }
  | { ok: true; source: 'recovered'; content: string }
  | { ok: true; source: 'research'; content: string; raw?: unknown }
  | { ok: false; source: 'server'; content: string; retrySafe: false; httpStatus: number; raw?: unknown }
  | { ok: false; source: 'transport'; content: string; retrySafe: false; httpStatus?: number }

export type AssistantTransportClientOptions = {
  sendUrl: string
  historyUrl: string
  locale?: AssistantTransportLocale
  historyPollAttempts?: number
  historyPollDelayMs?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  signal?: AbortSignal
  /** Maximum wait for the ordinary COS primary before a read-only knowledge turn can research. */
  primaryResponseBudgetMs?: number
  /** Set false to disable the owner-only read-only adaptive research endpoint. */
  researchFallbackUrl?: string | false
  /** Return false for a deliberate user Stop so AbortError remains a Stop, not a transport loss. */
  shouldRecoverTransportFailure?: (error: unknown) => boolean
}

export type AssistantHistoryRecoveryOptions = Readonly<{
  historyUrl: string
  historyPollAttempts?: number
  historyPollDelayMs?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}>

function text(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function isAssistantTransportFailure(error: unknown): boolean {
  const message = text(error instanceof Error ? `${error.name} ${error.message}` : error).toLowerCase()
  return ASSISTANT_TRANSPORT_ERROR_MARKERS.some(marker => message.includes(marker))
}

function timeoutCopy(locale: AssistantTransportLocale = 'en'): string {
  return ASSISTANT_TRANSPORT_TIMEOUT_COPY[locale] || ASSISTANT_TRANSPORT_TIMEOUT_COPY.en
}

function extractLiveContent(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const candidates = [record.content, record.reply, record.error, record.message, record.answer]
  for (const candidate of candidates) {
    const value = text(candidate)
    if (value) return value
  }
  return null
}

type ReadPayload = { payload: unknown; parsed: boolean }

async function readPayload(response: Response): Promise<ReadPayload> {
  const raw = await response.text()
  if (!raw.trim()) return { payload: null, parsed: true }
  try {
    return { payload: JSON.parse(raw), parsed: true }
  } catch {
    // Do not turn a Vercel/gateway HTML error page into an assistant answer.
    return { payload: null, parsed: false }
  }
}

function primaryResponseBudgetMs(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_PRIMARY_RESPONSE_BUDGET_MS)
  if (!Number.isFinite(parsed)) return DEFAULT_PRIMARY_RESPONSE_BUDGET_MS
  return Math.max(5_000, Math.min(120_000, Math.round(parsed)))
}

async function requestAdaptiveResearch(
  userContent: string,
  locale: AssistantTransportLocale,
  options: AssistantTransportClientOptions,
  reason: 'primary_deadline' | 'transport_loss' | 'cos_failed_closed',
): Promise<AssistantSendResult | null> {
  if (!isReadOnlyKnowledgePrompt(userContent)) return null
  if (options.signal?.aborted) return null
  const researchUrl = options.researchFallbackUrl === false
    ? null
    : options.researchFallbackUrl || '/api/cos-research'
  if (!researchUrl) return null

  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (options.signal) options.signal.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), ADAPTIVE_RESEARCH_CLIENT_BUDGET_MS)
  try {
    const response = await fetchImpl(researchUrl, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: userContent, language: locale, fallback_reason: reason }),
      signal: controller.signal,
    })
    const { payload } = await readPayload(response)
    const content = extractLiveContent(payload)
    if (!response.ok || !content) return null
    return { ok: true, source: 'research', content, raw: payload }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    if (options.signal) options.signal.removeEventListener('abort', onAbort)
  }
}

export async function loadAssistantHistory(
  historyUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StoredAssistantMessage[]> {
  const response = await fetchImpl(historyUrl, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) return []
  const { payload } = await readPayload(response)
  if (Array.isArray(payload)) return payload as StoredAssistantMessage[]
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const messages = record.messages ?? record.history ?? record.items
    if (Array.isArray(messages)) return messages as StoredAssistantMessage[]
  }
  return []
}

/** Read-only polling of one durable conversation. It never sends or replays an action. */
export async function recoverAssistantReplyFromHistory(
  userContent: string,
  sentAtMs: number,
  options: AssistantHistoryRecoveryOptions,
): Promise<string | null> {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)))
  const attempts = Math.max(1, Math.min(20, options.historyPollAttempts ?? 4))
  const delayMs = Math.max(250, Math.min(5_000, options.historyPollDelayMs ?? 1_200))

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(delayMs)
    try {
      const messages = await loadAssistantHistory(options.historyUrl, fetchImpl)
      const reply = findRecoveredAssistantReply(messages, userContent, sentAtMs)
      if (reply) return reply
    } catch {
      // A History read failure must not trigger a POST or hide the original transport loss.
    }
  }
  return null
}

async function recoverHistoryThenResearch(
  userContent: string,
  sentAtMs: number,
  options: AssistantTransportClientOptions,
  reason: 'primary_deadline' | 'transport_loss',
): Promise<AssistantSendResult | null> {
  const fetchImpl = options.fetchImpl ?? fetch
  const recovered = await recoverAssistantReplyFromHistory(userContent, sentAtMs, {
    historyUrl: options.historyUrl,
    historyPollAttempts: options.historyPollAttempts,
    historyPollDelayMs: options.historyPollDelayMs,
    fetchImpl,
    sleep: options.sleep,
  })
  if (recovered) return { ok: true, source: 'recovered', content: recovered }
  return requestAdaptiveResearch(userContent, options.locale ?? 'en', options, reason)
}

/**
 * Owner-assistant send path.
 *
 * Invariants:
 * - POST the original turn exactly once; never replay that POST after timeout/transport loss.
 * - Durable History is checked before any fallback answer is produced.
 * - Concise read-only knowledge questions may use a separate owner-only research POST. That route
 *   can search/synthesize an answer but has no action executor, so it cannot duplicate the original.
 * - A deliberate user Stop remains a Stop and never starts recovery research.
 */
export async function sendAssistantTurnAndRecover(
  userContent: string,
  body: Record<string, unknown>,
  options: AssistantTransportClientOptions,
): Promise<AssistantSendResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const locale = options.locale ?? 'en'
  const sentAtMs = Date.now()
  const primaryController = new AbortController()
  let primaryDeadlineExpired = false
  const onCallerAbort = () => primaryController.abort()
  if (options.signal) options.signal.addEventListener('abort', onCallerAbort, { once: true })
  const deadline = setTimeout(() => {
    primaryDeadlineExpired = true
    primaryController.abort()
  }, primaryResponseBudgetMs(options.primaryResponseBudgetMs))

  try {
    const response = await fetchImpl(options.sendUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: primaryController.signal,
    })
    const { payload, parsed } = await readPayload(response)
    const live = extractLiveContent(payload)

    if (response.ok && live) {
      if (payloadRequestsAdaptiveResearch(payload)) {
        const research = await requestAdaptiveResearch(userContent, locale, options, 'cos_failed_closed')
        if (research) return research
      }
      return { ok: true, source: 'live', content: live, raw: payload }
    }

    if (response.ok || !parsed || [408, 504, 524].includes(response.status)) {
      const recovered = await recoverAssistantReplyFromHistory(userContent, sentAtMs, {
        historyUrl: options.historyUrl,
        historyPollAttempts: options.historyPollAttempts,
        historyPollDelayMs: options.historyPollDelayMs,
        fetchImpl,
        sleep: options.sleep,
      })
      if (recovered) return { ok: true, source: 'recovered', content: recovered }
      const research = await requestAdaptiveResearch(userContent, locale, options, 'transport_loss')
      if (research) return research
    }

    if (!response.ok && live) {
      return { ok: false, source: 'server', retrySafe: false, httpStatus: response.status, content: live, raw: payload }
    }

    return {
      ok: false,
      source: 'transport',
      retrySafe: false,
      httpStatus: response.status,
      content: timeoutCopy(locale),
    }
  } catch (error) {
    // A deliberate user Stop wins over the internal first-answer deadline.
    if (options.signal?.aborted) {
      if (options.shouldRecoverTransportFailure && !options.shouldRecoverTransportFailure(error)) throw error
      throw error
    }

    if (primaryDeadlineExpired) {
      const recovered = await recoverHistoryThenResearch(userContent, sentAtMs, options, 'primary_deadline')
      if (recovered) return recovered
      return { ok: false, source: 'transport', retrySafe: false, content: timeoutCopy(locale) }
    }

    if (!isAssistantTransportFailure(error)) throw error
    if (options.shouldRecoverTransportFailure && !options.shouldRecoverTransportFailure(error)) throw error

    const recovered = await recoverHistoryThenResearch(userContent, sentAtMs, options, 'transport_loss')
    if (recovered) return recovered
    return {
      ok: false,
      source: 'transport',
      retrySafe: false,
      content: timeoutCopy(locale),
    }
  } finally {
    clearTimeout(deadline)
    if (options.signal) options.signal.removeEventListener('abort', onCallerAbort)
  }
}
