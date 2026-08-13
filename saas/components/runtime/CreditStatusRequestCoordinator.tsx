'use client'

// The platform has several independent UI surfaces that read /api/credits on
// mount. They are intentionally independent components, but they should not
// each create a Vercel function invocation for the same account snapshot.
//
// This coordinator is deliberately narrow:
// - GET /api/credits only
// - same-origin only
// - no custom headers/body/signal
// - memory only; nothing account-related is persisted in browser storage
// - responses are cloned so every existing caller can consume its own body
//
// The server remains authoritative for every spend/permission check. This only
// coalesces short-lived status reads used by the UI.

import { useLayoutEffect } from 'react'

export const CREDIT_STATUS_TTL_MS = 60_000
export const CREDIT_STATUS_INVALIDATE_EVENT = 'signalboost:credits-invalidated'

const METERED_MUTATION_PATHS = new Set([
  '/api/video-generate',
  '/api/video/export',
  '/api/video/transcribe',
  '/api/creative/generate-image',
])

type CachedCreditResponse = {
  response: Response
  storedAt: number
  cookieFingerprint: string
  generation: number
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (typeof input === 'string') return new URL(input, window.location.href)
    if (input instanceof URL) return new URL(input.href)
    if (typeof Request !== 'undefined' && input instanceof Request) return new URL(input.url)
  } catch {
    return null
  }
  return null
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase()
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase()
  return 'GET'
}

function hasCustomHeaders(headers: HeadersInit | undefined): boolean {
  if (!headers) return false
  if (headers instanceof Headers) return Array.from(headers.keys()).length > 0
  if (Array.isArray(headers)) return headers.length > 0
  return Object.keys(headers).length > 0
}

function isSimpleCreditsRead(input: RequestInfo | URL, init?: RequestInit): boolean {
  const url = requestUrl(input)
  if (!url || url.origin !== window.location.origin || url.pathname !== '/api/credits') return false
  if (requestMethod(input, init) !== 'GET') return false

  // A caller with its own headers/body/abort semantics is making a specialized
  // request. Do not silently alter those semantics; let the native fetch handle it.
  if (hasCustomHeaders(init?.headers) || init?.body || init?.signal) return false
  if (typeof Request !== 'undefined' && input instanceof Request) return false
  return true
}

function isMeteredMutation(input: RequestInfo | URL, init?: RequestInit): boolean {
  const url = requestUrl(input)
  if (!url || url.origin !== window.location.origin) return false
  const method = requestMethod(input, init)
  return method !== 'GET' && method !== 'HEAD' && METERED_MUTATION_PATHS.has(url.pathname)
}

function cookieFingerprint(): string {
  // Supabase browser sessions are cookie-backed in this app. Binding the tiny
  // memory cache to the current cookie string prevents reuse after an auth/session
  // change. A storage listener below covers cross-tab Supabase auth changes too.
  return document.cookie || ''
}

export default function CreditStatusRequestCoordinator() {
  useLayoutEffect(() => {
    const nativeFetch = window.fetch
    let generation = 0
    let cached: CachedCreditResponse | null = null
    let inFlight: Promise<Response> | null = null

    const invalidate = () => {
      generation += 1
      cached = null
      inFlight = null
    }

    const coordinatedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!isSimpleCreditsRead(input, init)) {
        const response = await nativeFetch(input, init)
        if (isMeteredMutation(input, init)) invalidate()
        return response
      }

      const now = Date.now()
      const fingerprint = cookieFingerprint()
      if (
        cached
        && cached.cookieFingerprint === fingerprint
        && cached.generation === generation
        && now - cached.storedAt < CREDIT_STATUS_TTL_MS
      ) {
        return cached.response.clone()
      }

      if (inFlight) return (await inFlight).clone()

      const requestGeneration = generation
      const requestFingerprint = fingerprint
      let requestPromise: Promise<Response>
      requestPromise = nativeFetch(input, { ...init, cache: 'no-store' })
        .then((response) => {
          if (
            response.ok
            && generation === requestGeneration
            && cookieFingerprint() === requestFingerprint
          ) {
            cached = {
              response: response.clone(),
              storedAt: Date.now(),
              cookieFingerprint: requestFingerprint,
              generation: requestGeneration,
            }
          }
          return response
        })
        .finally(() => {
          if (inFlight === requestPromise) inFlight = null
        })

      inFlight = requestPromise
      return (await requestPromise).clone()
    }) as typeof window.fetch

    const onStorage = (event: StorageEvent) => {
      const key = String(event.key || '').toLowerCase()
      if (!event.key || key.includes('supabase') || key.includes('auth')) invalidate()
    }
    const onExplicitInvalidate = () => invalidate()

    window.fetch = coordinatedFetch
    window.addEventListener('storage', onStorage)
    window.addEventListener(CREDIT_STATUS_INVALIDATE_EVENT, onExplicitInvalidate)

    return () => {
      if (window.fetch === coordinatedFetch) window.fetch = nativeFetch
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(CREDIT_STATUS_INVALIDATE_EVENT, onExplicitInvalidate)
      invalidate()
    }
  }, [])

  return null
}
