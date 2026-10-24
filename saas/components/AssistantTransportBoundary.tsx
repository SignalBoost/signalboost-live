// saas/components/AssistantTransportBoundary.tsx
'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  recoverAssistantReplyFromHistory,
  sendAssistantTurnAndRecover,
  type AssistantTransportLocale,
} from '@/lib/ai/cos/assistantTransportClient'
import { isConciergeBuilderObjective } from '@/lib/ai/cos/cosReasoningRolePolicy'
import { hasExplicitOperationalLogRepairIntent, isOperationalLogEvidence, isPastedOperationalLog } from '@/lib/ai/cos/pastedOperationalLog'
import { isConciergeArtifactObjective } from '@/lib/artifacts/intent'

type AssistantRequestBody = {
  messages?: Array<{ role?: unknown; content?: unknown }>
  context?: { conversationId?: unknown; language?: unknown }
  attachments?: Array<{ name?: unknown; mimeType?: unknown; type?: unknown; size?: unknown; dataUrl?: unknown }>
  [key: string]: unknown
}

const SOURCE_FILE = /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)$/i

const LIVE_BUILDER_KEY = 'cos-builder-live-conversation-job-v1'
const LIVE_BUILDER_EVENT = 'cos-builder-live-job'
type LiveBuilder = { jobId: string; conversationId: string; status: string; reply: string }
function announceLiveBuilder(job: LiveBuilder): void {
  try { window.localStorage.setItem(LIVE_BUILDER_KEY, JSON.stringify(job)) } catch { /* storage optional */ }
  window.dispatchEvent(new CustomEvent<LiveBuilder>(LIVE_BUILDER_EVENT, { detail: job }))
}

const BUILDER_JOB_POLL_ATTEMPTS = 240
const BUILDER_JOB_POLL_DELAY_MS = 2_000
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
  return isOperationalLogEvidence(current)
    || (hasExplicitOperationalLogRepairIntent(current) && isPastedOperationalLog(previous))
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

async function durablePreviousOperationalLog(
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
      if (hasExplicitOperationalLogRepairIntent(content)) continue
      return isPastedOperationalLog(content) ? content : null
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

function bodyWithOperationalRepairFollowup(body: AssistantRequestBody, operationalLog: string): AssistantRequestBody {
  const messages = Array.isArray(body.messages) ? body.messages : []
  let latestUserIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      latestUserIndex = index
      break
    }
  }
  if (latestUserIndex < 0) return body
  const latest = messages[latestUserIndex]
  const current = typeof latest?.content === 'string' ? latest.content.trim() : ''
  if (!current || !operationalLog.trim()) return body
  return {
    ...body,
    messages: messages.map((message, index) => index === latestUserIndex
      ? { ...message, content: `${current}\n\n${operationalLog.trim()}` }
      : message),
  }
}

function localeFromBody(body: AssistantRequestBody): AssistantTransportLocale {
  const value = String(body.context?.language || 'en').toLowerCase()
  return (['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(value) ? value : 'en') as AssistantTransportLocale
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
      if (response.status === 202 || record.status === 'queued' || record.status === 'running' || record.status === 'paused') continue
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
      // Enqueueing is durable; the foreground Assistant timeout must not cancel this POST.
      body: JSON.stringify({ objective, files: builderFilesFromBody(body), conversationId }),
    })
  } catch (error) {
    // The POST might have been accepted before its response transport was aborted.
    // Recover durable History without replaying an action whose outcome is unknown.
    const recovered = await recoverBuilderFromHistory(fetchImpl, conversationId, objective, sentAtMs)
    return recovered || responseFromPayload({
      reply: 'The Builder request may still be running. Check History for progress and the final result; the action was not replayed.',
      source: 'builder-transport-background-job',
    }, 202, 'builder-transport-background-job')
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

  announceLiveBuilder({ jobId, conversationId, status: 'running', reply: 'Building your application. Progress and the final result will appear here automatically.' })

  // POST already created a durable job and History row. Return the receipt immediately;
  // holding Concierge open until the worker finishes causes a false client timeout.
  return responseFromPayload({
    ...payload,
    status: 'running',
    reply: 'COS Builder is working. Live progress and the final result will be shown on this page.',
  }, 202, 'builder-job-running')
}

async function executeOperationalRepairFromConcierge(
  fetchImpl: typeof window.fetch,
  body: AssistantRequestBody,
  objective: string,
  conversationId: string,
  signal?: AbortSignal,
): Promise<Response> {
  const sentAtMs = Date.now()
  let response: Response
  try {
    response = await fetchImpl('/api/cos-browser', {
      method: 'POST',
      credentials: 'include',
      headers: { accept: 'application/json', 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(body),
    })
  } catch (error) {
    // The operational repair may already be durable. Recover without replay.
    const recovered = await recoverBuilderFromHistory(fetchImpl, conversationId, objective, sentAtMs)
    return recovered || responseFromPayload({
      reply: 'The repair request may still be running. Check History; the action was not replayed.',
      source: 'operational-repair-transport-background-job',
    }, 202, 'operational-repair-transport-background-job')
  }
  const payload = await response.json().catch(() => ({ error: 'operational_repair_response_unavailable' })) as Record<string, unknown>

  // Passive logs and authorization failures are already terminal. Repository repair uses the
  // durable Builder job contract, so follow it to completion and return the result/files to the
  // same Concierge renderer instead of treating the initial 202 running reply as final output.
  const jobId = typeof payload.jobId === 'string' ? payload.jobId : ''
  if (response.status !== 202 || !jobId) {
    return responseFromPayload(payload, response.status, 'operational-repair-backend')
  }

  announceLiveBuilder({ jobId, conversationId, status: 'running', reply: 'Repair in progress. Results will appear here automatically.' })

  // Durable repair accepted: return its receipt now; History owns the final outcome.
  return responseFromPayload({
    ...payload,
    status: 'running',
    reply: 'COS is repairing the issue. Live progress and results will be shown on this page.',
  }, 202, 'operational-repair-running')
}

async function executeArtifactFromConcierge(
  fetchImpl: typeof window.fetch,
  body: AssistantRequestBody,
  objective: string,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetchImpl('/api/artifacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      objective,
      sourceText: [...(Array.isArray(body.messages) ? body.messages : [])].reverse()
        .find(message => message?.role === 'assistant' && typeof message.content === 'string')?.content || '',
    }),
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
  const [liveJob, setLiveJob] = useState<LiveBuilder | null>(null)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LIVE_BUILDER_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as LiveBuilder
        if (typeof parsed.jobId === 'string' && /^[0-9a-f-]{36}$/i.test(parsed.jobId)) setLiveJob(parsed)
      }
    } catch { /* storage optional */ }
    const listener = (event: Event) => setLiveJob((event as CustomEvent<LiveBuilder>).detail)
    window.addEventListener(LIVE_BUILDER_EVENT, listener)
    return () => window.removeEventListener(LIVE_BUILDER_EVENT, listener)
  }, [])
  useEffect(() => {
    if (!liveJob?.jobId || !['running', 'paused', 'queued'].includes(liveJob.status)) return
    let disposed = false
    const check = async () => {
      try {
        const response = await window.fetch('/api/builder?observeOnly=true&jobId=' + encodeURIComponent(liveJob.jobId), { cache: 'no-store' })
        if (!response.ok && response.status !== 202) return
        const result = await response.json() as Record<string, unknown>
        if (disposed) return
        const nextStatus = String(result.status || 'running')
        const nextReply = typeof result.reply === 'string' ? result.reply
          : typeof (result.result as Record<string, unknown> | undefined)?.reply === 'string'
            ? String((result.result as Record<string, unknown>).reply)
            : liveJob.reply
        const updated = { ...liveJob, status: nextStatus, reply: nextReply }
        if (updated.status !== liveJob.status || updated.reply !== liveJob.reply) announceLiveBuilder(updated)
      } catch { /* polling is read-only; retry without resubmission */ }
    }
    void check()
    const timer = window.setInterval(() => { void check() }, 3000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [liveJob?.jobId, liveJob?.status, liveJob?.reply])
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      if (!isCosPrimaryPost(input, init)) return originalFetch(input, init)

      const body = parseAssistantBody(init)
      const conversationId = String(body?.context?.conversationId || '').trim()
      const userContent = body ? latestUserContent(body) : ''
      if (!body || !conversationId || !userContent) return originalFetch(input, init)

      if (isConciergeArtifactObjective(userContent)) {
        return executeArtifactFromConcierge(originalFetch, body, userContent, init?.signal ?? undefined)
      }
      if (isConciergeBuilderObjective(userContent, builderRoutingContext(body))) {
        return executeBuilderFromConcierge(originalFetch, body, userContent, conversationId, init?.signal ?? undefined)
      }

      const users = userContents(body)
      const previousUserContent = users.at(-2) || ''
      let operationalRepair = isOperationalLogEvidence(userContent) || shouldUseConciergeRepairIngress(body)
      let sendBody: AssistantRequestBody = body

      // Natural two-turn flow: the user pastes a passive failure, Concierge explains it, then the
      // user says "fix it". Carry the immediately preceding log into the current request so the
      // server receives explicit repair intent and the original failure evidence in one bounded turn.
      if (hasExplicitOperationalLogRepairIntent(userContent)) {
        let previousOperationalLog = isPastedOperationalLog(previousUserContent) ? previousUserContent : null
        if (!previousOperationalLog) {
          previousOperationalLog = await durablePreviousOperationalLog(
            originalFetch,
            conversationId,
            init?.signal ?? undefined,
          )
        }
        if (previousOperationalLog) {
          operationalRepair = true
          sendBody = bodyWithOperationalRepairFollowup(body, previousOperationalLog)
        }
      }

      // Preserve the older reverse-order recovery as well: a repair instruction may have been sent
      // immediately before a pasted log and omitted from the current request transcript.
      if (isPastedOperationalLog(userContent) && !hasExplicitOperationalLogRepairIntent(previousUserContent)) {
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
      if (operationalRepair) {
        return executeOperationalRepairFromConcierge(
          originalFetch,
          sendBody,
          userContent,
          conversationId,
          init?.signal ?? undefined,
        )
      }

      const result = await sendAssistantTurnAndRecover(userContent, sendBody as Record<string, unknown>, {
        sendUrl: '/api/cos-primary',
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

  return <>
    {children}
    {liveJob && <aside role="status" aria-live="polite" style={{ position: 'fixed', insetInlineEnd: 20, bottom: 20, zIndex: 10000, width: 'min(410px, calc(100vw - 40px))', maxHeight: '55vh', overflowY: 'auto', padding: 14, border: '1px solid #334155', borderRadius: 12, background: '#0f172a', color: '#f8fafc', boxShadow: '0 8px 28px #0006', fontSize: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <strong>COS Builder · {liveJob.status === 'succeeded' ? 'Completed' : liveJob.status === 'failed' ? 'Needs attention' : liveJob.status === 'paused' ? 'Continuing' : 'Working'}</strong>
        <button type="button" aria-label="Dismiss Builder status" onClick={() => { setLiveJob(null); try { window.localStorage.removeItem(LIVE_BUILDER_KEY) } catch {} }} style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer' }}>×</button>
      </div>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: 4 }}>{liveJob.reply}</p>
      <small style={{ opacity: .7 }}>Job {liveJob.jobId}</small>
    </aside>}
  </>
}
