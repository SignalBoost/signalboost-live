'use client'

import { useEffect, type ReactNode } from 'react'
import {
  sendAssistantTurnAndRecover,
  type AssistantTransportLocale,
} from '@/lib/ai/cos/assistantTransportClient'

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
