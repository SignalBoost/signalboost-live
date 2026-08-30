'use client'

import { useEffect, type ReactNode } from 'react'
import {
  sendAssistantTurnAndRecover,
  type AssistantTransportLocale,
} from '@/lib/ai/cos/assistantTransportClient'
import { isCosCodingObjective } from '@/lib/ai/cos/cosReasoningRolePolicy'
import { isConciergeArtifactObjective } from '@/lib/artifacts/intent'

type AssistantRequestBody = {
  messages?: Array<{ role?: unknown; content?: unknown }>
  context?: { conversationId?: unknown; language?: unknown }
  [key: string]: unknown
}

function parseAssistantBody(init?: RequestInit): AssistantRequestBody | null {
  if (typeof init?.body !== 'string') return null
  try {
    const parsed = JSON.parse(init.body)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as AssistantRequestBody : null
  } catch {
    return null
  }
}

function latestUserContent(body: AssistantRequestBody): string {
  const messages = Array.isArray(body.messages) ? body.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user') continue
    if (typeof message.content === 'string') return message.content.trim()
  }
  return ''
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
      ...(source ? { 'x-signalboost-assistant-transport': source } : {}),
    },
  })
}

function builderFilesFromBody(body: AssistantRequestBody): Array<{ path: string; content: string }> {
  const attachments = Array.isArray(body.attachments) ? body.attachments : []
  return attachments.slice(0, 20).flatMap((attachment: any) => {
    const path = typeof attachment?.name === 'string' ? attachment.name : ''
    const mimeType = String(attachment?.mimeType || attachment?.type || '')
    const dataUrl = typeof attachment?.dataUrl === 'string' ? attachment.dataUrl : ''
    if (!path || !dataUrl || !(mimeType.startsWith('text/') || mimeType === 'application/json')) return []
    try {
      const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1)
      const content = new TextDecoder().decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)))
      return content.length <= 512 * 1024 ? [{ path, content }] : []
    } catch {
      return []
    }
  })
}

async function executeBuilderFromConcierge(
  fetchImpl: typeof window.fetch,
  body: AssistantRequestBody,
  objective: string,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetchImpl('/api/builder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ objective, files: builderFilesFromBody(body) }),
  })
  const payload = await response.json().catch(() => ({ error: 'builder_response_unavailable' }))
  return responseFromPayload({
    ...payload,
    reply: typeof (payload as any)?.reply === 'string'
      ? (payload as any).reply
      : 'COS Builder stopped: ' + String((payload as any)?.error || 'builder_request_failed'),
  }, response.status, 'builder-backend')
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
    ...payload,
    reply: typeof (payload as any)?.reply === 'string'
      ? (payload as any).reply
      : 'COS could not create that file: ' + String((payload as any)?.error || 'artifact_request_failed'),
  }, response.status, 'artifact-backend')
}


/**
 * Transport continuity boundary for the authorized owner Assistant only.
 *
 * The existing page keeps its own deadline and Stop button. This wrapper handles the browser-only
 * failure observed in Production (`TypeError: Failed to fetch`) without replaying the POST. It polls
 * the exact conversation History and returns a synthetic response only when the original response
 * was lost. AbortError is deliberately rethrown so the page can still distinguish Stop/deadline.
 */
export default function AssistantTransportBoundary({ children }: { children: ReactNode }) {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      if (!isCosPrimaryPost(input, init)) return originalFetch(input, init)

      const body = parseAssistantBody(init)
      const conversationId = String(body?.context?.conversationId || '').trim()
      const userContent = body ? latestUserContent(body) : ''
      if (!body || !conversationId || !userContent) return originalFetch(input, init)

      // Files are internal Concierge tools. An explicit PDF/TXT request creates a download;
      // coding tasks invoke Builder. Everything else remains the normal COS answer path.
      if (isConciergeArtifactObjective(userContent)) {
        return executeArtifactFromConcierge(originalFetch, userContent, init?.signal ?? undefined)
      }
      if (isCosCodingObjective(userContent)) {
        return executeBuilderFromConcierge(originalFetch, body, userContent, init?.signal ?? undefined)
      }

      const result = await sendAssistantTurnAndRecover(userContent, body as Record<string, unknown>, {
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

  return children
}
