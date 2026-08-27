import {
  ASSISTANT_TRANSPORT_TIMEOUT_COPY,
  findRecoveredAssistantReply,
  type StoredAssistantMessage,
} from './assistantTransportRecovery.ts'

export const ASSISTANT_TRANSPORT_ERROR_MARKERS = [
  'failed to fetch',
  'networkerror when attempting to fetch resource',
  'load failed',
  'the operation was aborted',
  'aborterror',
  'timeout',
] as const

export type AssistantTransportLocale = keyof typeof ASSISTANT_TRANSPORT_TIMEOUT_COPY

export type AssistantSendResult =
  | { ok: true; source: 'live'; content: string; raw?: unknown }
  | { ok: true; source: 'recovered'; content: string }
  | { ok: false; source: 'transport'; content: string; retrySafe: false }

export type AssistantTransportClientOptions = {
  sendUrl: string
  historyUrl: string
  locale?: AssistantTransportLocale
  historyPollAttempts?: number
  historyPollDelayMs?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

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
  const candidates = [record.content, record.reply, record.message, record.answer]
  for (const candidate of candidates) {
    const value = text(candidate)
    if (value) return value
  }
  return null
}

async function readJson(response: Response): Promise<unknown> {
  const raw = await response.text()
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw)
  } catch {
    return { content: raw }
  }
}

async function loadHistory(
  historyUrl: string,
  fetchImpl: typeof fetch,
): Promise<StoredAssistantMessage[]> {
  const response = await fetchImpl(historyUrl, {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) return []
  const payload = await readJson(response)
  if (Array.isArray(payload)) return payload as StoredAssistantMessage[]
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const messages = record.messages ?? record.history ?? record.items
    if (Array.isArray(messages)) return messages as StoredAssistantMessage[]
  }
  return []
}

/**
 * Owner-assistant send path.
 *
 * Rules:
 * - POST the user turn once.
 * - If the browser loses the response (`TypeError: Failed to fetch`, abort, timeout),
 *   do NOT POST again. Poll History and recover the persisted assistant reply.
 * - If History has no reply yet, show the existing timeout copy instead of the raw TypeError.
 */
export async function sendAssistantTurnAndRecover(
  userContent: string,
  body: Record<string, unknown>,
  options: AssistantTransportClientOptions,
): Promise<AssistantSendResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)))
  const locale = options.locale ?? 'en'
  const attempts = Math.max(1, Math.min(8, options.historyPollAttempts ?? 4))
  const delayMs = Math.max(250, Math.min(5_000, options.historyPollDelayMs ?? 1_200))
  const sentAtMs = Date.now()

  try {
    const response = await fetchImpl(options.sendUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const payload = await readJson(response)
    const live = extractLiveContent(payload)
    if (response.ok && live) return { ok: true, source: 'live', content: live, raw: payload }
    if (response.ok) {
      const recovered = await recoverFromHistory(userContent, sentAtMs, options, fetchImpl, sleep, attempts, delayMs)
      if (recovered) return recovered
    }
    return {
      ok: false,
      source: 'transport',
      retrySafe: false,
      content: live || timeoutCopy(locale),
    }
  } catch (error) {
    if (!isAssistantTransportFailure(error)) throw error
    const recovered = await recoverFromHistory(userContent, sentAtMs, options, fetchImpl, sleep, attempts, delayMs)
    if (recovered) return recovered
    return {
      ok: false,
      source: 'transport',
      retrySafe: false,
      content: timeoutCopy(locale),
    }
  }
}

async function recoverFromHistory(
  userContent: string,
  sentAtMs: number,
  options: AssistantTransportClientOptions,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
  attempts: number,
  delayMs: number,
): Promise<AssistantSendResult | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(delayMs)
    try {
      const messages = await loadHistory(options.historyUrl, fetchImpl)
      const reply = findRecoveredAssistantReply(messages, userContent, sentAtMs)
      if (reply) return { ok: true, source: 'recovered', content: reply }
    } catch {
      // History poll failure must not hide the original transport loss.
    }
  }
  return null
}
