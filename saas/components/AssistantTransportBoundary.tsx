// saas/components/AssistantTransportBoundary.tsx
'use client'

import { useEffect, type ReactNode } from 'react'
import {
  recoverAssistantReplyFromHistory,
  sendAssistantTurnAndRecover,
  type AssistantTransportLocale,
} from '@/lib/ai/cos/assistantTransportClient'
import { isConciergeBuilderObjective } from '@/lib/ai/cos/cosReasoningRolePolicy'
import { hasExplicitOperationalLogRepairIntent, isPastedOperationalLog } from '@/lib/ai/cos/pastedOperationalLog'
import { isConciergeArtifactObjective } from '@/lib/artifacts/intent'

type AssistantRequestBody = {
  messages?: Array<{ role?: unknown; content?: unknown }>
  context?: { conversationId?: unknown; language?: unknown }
  attachments?: Array<{ name?: unknown; mimeType?: unknown; type?: unknown; size?: unknown; dataUrl?: unknown }>
  [key: string]: unknown
}

const SOURCE_FILE = /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)$/i
const BUILDER_JOB_POLL_ATTEMPTS = 20
const BUILDER_JOB_POLL_DELAY_MS = 1_500
const BUILDER_HISTORY_POLL_ATTEMPTS = 11
const BUILDER_HISTORY_POLL_DELAY_MS = 2_500

function parseAssistantBody(init?: RequestInit): AssistantRequestBody | null {
  if (typeof init?.body !== 'string') return null
  try {
    const parsed = JSON.parse(init.body)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as AssistantRequestBody : null
  } catch {
    return null
  }
}

function userContents(body: AssistantRequestBody): string[] {
  const messages = Array.isArray(body.messages) ? body.messages : []
  return messages.flatMap(message => message?.role === 'user' && typeof message.content === 'string' ? [message.content.trim()] : [])
}

function latestUserContent(body: AssistantRequestBody): string {
  return userContents(body).at(-1) || ''
}

function shouldUseConciergeRepairIngress(body: AssistantRequestBody): boolean {
  const users = userContents(body)
  const current = users.at(-1) || ''
  const previous = users.at(-2) || ''
  return isPastedOperationalLog(current)
    && (hasExplicitOperationalLogRepairIntent(current) || hasExplicitOperationalLogRepairIntent(previous))
}

async function durablePreviousRepairIntent(
  fetchImpl: typeof window.fetch,
  conversationId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await fetchImpl(`/api/assistant/chats?id=${encodeURIComponent(conversationId)}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal,
    })
    if (!response.ok) return null
    const payload = await response.json().catch(() => null)
    const messages = Array.isArray(payload?.messages) ? payload.messages : []
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message?.role !== 'user' || typeof message.content !== 'string') continue
      const content = message.content.trim()
      return hasExplicitOperationalLogRepairIntent(content) ? content : null
    }
  } catch (error) {
    if (deliberateAbort(error, signal)) throw error
  }
  return null
}

function bodyWithPreviousUserTurn(body: AssistantRequestBody, previousUserContent: string): AssistantRequestBody {
  const messages = Array.isArray(body.messages) ? body.messages : []
  let latestUserIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      latestUserIndex = index
      break
    }
  }
  if (latestUserIndex < 0) return body
  return {
    ...body,
    messages: [
      ...messages.slice(0, latestUserIndex),
      { role: 'user', content: previousUserContent },
      ...messages.slice(latestUserIndex),
    ],
  }
}

function localeFromBody(body: AssistantRequestBody): AssistantTransportLocale {
  const value = String(body.context?.language || 'en').toLowerCase()
  return (['en', 'es', 'pt', 'pl', 'ru'].includes(value) ? value : 'en') as AssistantTransportLocale
}

function isCosPrimaryPost(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method !== 'POST') return false
  const raw = input instanceof Request ? input.url : String(input)
  try {
    return new URL(raw, window.location.origin).pathname === '/api/cos-primary'
  } catch {
    return false
  }
}

function responseFromPayload(payload: unknown, status = 200, source?: string): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store, max-age=0',
      ...(source ? { 'x-signalboost-assistant-transport': source } : {}),
    },
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function builderRoutingContext(body: AssistantRequestBody) {
  const attachments = Array.isArray(body.attachments) ? body.attachments : []
  return {
    attachmentNames: attachments.map(item => String(item?.name || '')),
    attachmentMimeTypes: attachments.map(item => String(item?.mimeType || item?.type || '')),
    attachmentSizes: attachments.map(item => Number(item?.size || 0)),
  }
}

function builderFilesFromBody(body: AssistantRequestBody): Array<{ path: string; content: string }> {
  const attachments = Array.isArray(body.attachments) ? body.attachments : []
  return attachments.slice(0, 20).flatMap(attachment => {
    const path = typeof attachment?.name === 'string' ? attachment.name : ''
    const mimeType = String(attachment?.mimeType || attachment?.type || '')
    const dataUrl = typeof attachment?.dataUrl === 'string' ? attachment.dataUrl : ''
    const textLike = mimeType.startsWith('text/') || mimeType === 'application/json' || SOURCE_FILE.test(path)
    if (!path || !dataUrl || !textLike) return []
    try {
      const comma = dataUrl.indexOf(',')
      const encoded = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
      const content = new TextDecoder().decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)))
      return content.length <= 512 * 1024 ? [{ path, content }] : []
    } catch {
      return []
    }
  })
}

function deliberateAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError')
}

async function pollBuilderJob(
  fetchImpl: typeof window.fetch,
  jobId: string,
  signal?: AbortSignal,
): Promise<{ payload: Record<string, unknown>; status: number } | null> {
  for (let attempt = 0; attempt < BUILDER_JOB_POLL_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
    if (attempt > 0) await sleep(BUILDER_JOB_POLL_DELAY_MS)
    if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
    try {
      const response = await fetchImpl(`/api/builder?jobId=${encodeURIComponent(jobId)}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal,
      })
      const payload = await response.json().catch(() => null)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue
      const record = payload as Record<string, unknown>
      if (response.status === 202 || record.status === 'queued' || record.status === 'running') continue
      return { payload: record, status: response.status }
    } catch (error) {
      if (deliberateAbort(error, signal)) throw error
      // Polling is read-only. A transient GET failure never causes a second Builder POST.
    }
  }
  return null
}

async function recoverBuilderFromHistory(
  fetchImpl: typeof window.fetch,
  conversationId: string,
  objective: string,
  sentAtMs: number,
): Promise<Response | null> {
  const recovered = await recoverAssistantReplyFromHistory(objective, sentAtMs, {
    historyUrl: `/api/assistant/chats?id=${encodeURIComponent(conversationId)}`,
    historyPollAttempts: BUILDER_HISTORY_POLL_ATTEMPTS,
    historyPollDelayMs: BUILDER_HISTORY_POLL_DELAY_MS,
    fetchImpl,
  })
  return recovered
    ? responseFromPayload({ reply: recovered, source: 'builder-history-recovery' }, 200, 'builder-history-recovery')
    : null
}

async function executeBuilderFromConcierge(
  fetchImpl: typeof window.fetch,
  body: AssistantRequestBody,
  objective: string,
  conversationId: string,
  signal?: AbortSignal,
): Promise<Response> {
  const sentAtMs = Date.now()
  let response: Response
  try {
    response = await fetchImpl('/api/builder', {
      method: 'POST',
      credentials: 'include',
      headers: { accept: 'application/json', 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ objective, files: builderFilesFromBody(body), conversationId }),
    })
  } catch (error) {
    if (deliberateAbort(error, signal)) throw error
    // The server may have accepted the POST before a browser transport loss. Poll durable History
    // for 20–30 seconds, but never replay the action.
    const recovered = await recoverBuilderFromHistory(fetchImpl, conversationId, objective, sentAtMs)
    return recovered || responseFromPayload({
      reply: 'The Builder request could not be confirmed. History did not show a durable running or completed job, so the action was not replayed.',
      source: 'builder-transport-unconfirmed',
    }, 503, 'builder-transport-unconfirmed')
  }

  const payload = await response.json().catch(() => ({ error: 'builder_response_unavailable' })) as Record<string, unknown>
  if (response.status !== 202) {
    return responseFromPayload({
      ...payload,
      reply: typeof payload.reply === 'string'
        ? payload.reply
        : `COS Builder stopped: ${String(payload.error || 'builder_request_failed')}`,
    }, response.status, 'builder-backend')
  }

  const jobId = typeof payload.jobId === 'string' ? payload.jobId : ''
  if (!jobId) {
    const recovered = await recoverBuilderFromHistory(fetchImpl, conversationId, objective, sentAtMs)
    return recovered || responseFromPayload({
      reply: 'COS Builder did not return a durable job identifier. The action was not replayed.',
      source: 'builder-job-id-missing',
    }, 503, 'builder-job-id-missing')
  }

  const terminal = await pollBuilderJob(fetchImpl, jobId, signal)
  if (terminal) {
    return responseFromPayload({
      ...terminal.payload,
      reply: typeof terminal.payload.reply === 'string'
        ? terminal.payload.reply
        : `COS Builder stopped: ${String(terminal.payload.error || 'builder_job_failed')}`,
    }, terminal.status, 'builder-job-terminal')
  }

  // The page does not wait for the entire debug lifecycle. The durable running message already
  // exists in History and the final worker result will update that same row without another Send.
  return responseFromPayload({
    ...payload,
    status: 'running',
    reply: typeof payload.reply === 'string'
      ? payload.reply
      : `COS Builder is running job ${jobId}. The final result will appear in History.`,
  }, 202, 'builder-job-running')
}

async function executeArtifactFromConcierge(
  fetchImpl: typeof window.fetch,
  objective: string,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetchImpl('/api/artifacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ objective }),
  })
  const payload = await response.json().catch(() => ({ error: 'artifact_response_unavailable' }))
  return responseFromPayload({
    ...(payload as Record<string, unknown>),
    reply: typeof (payload as any)?.reply === 'string'
      ? (payload as any).reply
      : 'COS could not create that file: ' + String((payload as any)?.error || 'artifact_request_failed'),
  }, response.status, 'artifact-backend')
}

/** Transport and internal-tool boundary for the authorized owner Assistant. */
export default function AssistantTransportBoundary({ children }: { children: ReactNode }) {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      if (!isCosPrimaryPost(input, init)) return originalFetch(input, init)

      const body = parseAssistantBody(init)
      const conversationId = String(body?.context?.conversationId || '').trim()
      const userContent = body ? latestUserContent(body) : ''
      if (!body || !conversationId || !userContent) return originalFetch(input, init)

      if (isConciergeArtifactObjective(userContent)) {
        return executeArtifactFromConcierge(originalFetch, userContent, init?.signal ?? undefined)
      }
      if (isConciergeBuilderObjective(userContent, builderRoutingContext(body))) {
        return executeBuilderFromConcierge(originalFetch, body, userContent, conversationId, init?.signal ?? undefined)
      }

      let operationalRepair = isPastedOperationalLog(userContent) || shouldUseConciergeRepairIngress(body)
      let sendBody: AssistantRequestBody = body
      if (!operationalRepair && isPastedOperationalLog(userContent)) {
        const recoveredRepairIntent = await durablePreviousRepairIntent(
          originalFetch,
          conversationId,
          init?.signal ?? undefined,
        )
        if (recoveredRepairIntent) {
          operationalRepair = true
          sendBody = bodyWithPreviousUserTurn(body, recoveredRepairIntent)
        }
      }
      // Preserve privileged owner COS scope for ordinary turns. Every pasted operational log enters
      // the canonical browser ingress; the server alone decides whether it is owner-bound SignalBoost
      // repair evidence or a passive analysis-only log.
      const result = await sendAssistantTurnAndRecover(userContent, sendBody as Record<string, unknown>, {
        sendUrl: operationalRepair ? '/api/cos-browser' : '/api/cos-primary',
        historyUrl: `/api/assistant/chats?id=${encodeURIComponent(conversationId)}`,
        locale: localeFromBody(body),
        fetchImpl: originalFetch,
        signal: init?.signal ?? undefined,
        historyPollAttempts: 4,
        historyPollDelayMs: 1_200,
        shouldRecoverTransportFailure: error => !(error instanceof DOMException && error.name === 'AbortError'),
      })

      if (result.ok && result.source === 'live' && result.raw && typeof result.raw === 'object') {
        return responseFromPayload(result.raw, 200, result.source)
      }
      if (!result.ok && result.source === 'server' && result.raw && typeof result.raw === 'object') {
        return responseFromPayload(result.raw, result.httpStatus, result.source)
      }

      const status = result.ok ? 200 : result.source === 'server' ? result.httpStatus : 503
      return responseFromPayload({ reply: result.content, source: `assistant-${result.source}` }, status, result.source)
    }

    window.fetch = wrappedFetch
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = originalFetch
    }
  }, [])

  return children
}
