// saas/middleware.ts
//
// ANONYMOUS SPEND GATE for the public Concierge widget.
//
// WHY THIS FILE EXISTS. The four public lead-magnet routes (surface-scan,
// site-optimization, cybersecurity-preview, lead-intake) make ZERO model calls and each
// carries its own per-IP limiter. The audit console is metered properly by
// lib/audit/scanThrottle.ts — free tier is one scan, ten files, LIFETIME. But the
// Concierge chat box sits on every public page, reaches a model through
// /api/concierge → /api/support, and had NO limit of any kind. Its access check is
// `getAccess().catch(() => null)`, so an anonymous visitor is served and `createdBy`
// simply lands as null. The metered tool had a lifetime cap; the chat box beside it
// was an open, unauthenticated, unbounded model endpoint.
//
// WHAT THIS DOES NOT DO. It does not authenticate, authorize, or change any answer.
// It counts anonymous POSTs per IP and refuses the ones past the ceiling, before the
// route runs and therefore before any provider is called. Signed-in traffic is passed
// through untouched — their limits are the existing plan/credit gates, which this file
// deliberately does not duplicate.
//
// HONEST LIMITATION, stated rather than discovered later: the counter lives in memory
// on one serverless instance, so the effective ceiling is per-instance, not global.
// That is the same property the four public routes already accept. It bounds casual
// abuse and scripted hammering from one address; it is not a hard global cap. A hard
// cap needs a shared store (Supabase or Upstash) and belongs with the wider Execution
// Governor work, not in a hotfix.

import { NextResponse, type NextRequest } from 'next/server'

// Only the model-reaching public surfaces. Everything else in the app is untouched by
// this file — a wide matcher here would put every request through this code path.
export const config = {
  matcher: ['/api/concierge', '/api/support'],
}

const RATE_WINDOW_MS = 10 * 60_000
const ANONYMOUS_MAX = 8

const buckets = new Map<string, { count: number; resetAt: number }>()

/**
 * A Supabase session cookie is written as `sb-<project-ref>-auth-token`, and chunked
 * into `.0` / `.1` suffixes when it exceeds the cookie size limit. Presence proves a
 * session cookie was issued, not that it is still valid — deliberately. A stale cookie
 * therefore gets the signed-in path, which is the SAFE direction to be wrong in: the
 * route's own getAccess() is the real authority, and this file must never be the reason
 * a paying customer is refused.
 */
function hasSessionCookie(req: NextRequest): boolean {
  for (const cookie of req.cookies.getAll()) {
    if (/^sb-.+-auth-token(\.\d+)?$/.test(cookie.name)) return true
  }
  return false
}

function clientIpKey(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for') || ''
  const first = forwarded.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'unknown'
}

function overLimit(key: string): boolean {
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }

  existing.count += 1

  // Opportunistic sweep, same shape as the public routes: expired buckets are dropped
  // on a cheap cadence so the map cannot grow without bound on a long-lived instance.
  if (existing.count % 50 === 0 || buckets.size > 5000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey)
    }
  }

  return existing.count > ANONYMOUS_MAX
}

/**
 * A refusal states its reason where the person will see it, in their own language, and
 * says exactly what to do next. The widget renders the `reply` field, so the visitor
 * reads a sentence rather than watching the box fail silently.
 */
function limitReply(language: string): string {
  const messages: Record<string, string> = {
    en: 'You have reached the free preview limit for this assistant. Sign in to keep going — your account has a much higher allowance, and the conversation continues from here.',
    es: 'Ha alcanzado el límite de vista previa gratuita de este asistente. Inicie sesión para continuar: su cuenta tiene un límite mucho mayor y la conversación continúa desde aquí.',
    pt: 'Você atingiu o limite da prévia gratuita deste assistente. Entre na sua conta para continuar: sua conta tem um limite muito maior e a conversa segue a partir daqui.',
    pl: 'Osiągnięto limit bezpłatnego podglądu tego asystenta. Zaloguj się, aby kontynuować — Twoje konto ma znacznie wyższy limit, a rozmowa jest kontynuowana od tego miejsca.',
    ru: 'Достигнут лимит бесплатного предпросмотра этого ассистента. Войдите в аккаунт, чтобы продолжить: там лимит значительно выше, а разговор продолжится с этого места.',
  }
  return messages[language] || messages.en
}

function languageFrom(req: NextRequest): string {
  const stored = req.cookies.get('sb_locale')?.value || ''
  const normalized = stored.toLowerCase().slice(0, 2)
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(normalized) ? normalized : 'en'
}

export function middleware(req: NextRequest) {
  // Only a POST reaches a model. GETs, preflights and health checks cost nothing and
  // are never counted against a visitor.
  if (req.method !== 'POST') return NextResponse.next()

  // Signed-in traffic is governed by the existing plan and credit gates inside the
  // routes. This file exists for the anonymous case only.
  if (hasSessionCookie(req)) return NextResponse.next()

  if (!overLimit(`anonymous-concierge:${clientIpKey(req)}`)) return NextResponse.next()

  const language = languageFrom(req)
  return NextResponse.json(
    {
      reply: limitReply(language),
      source: 'anonymous-preview-limit',
      rate_limited: true,
      sign_in_required: true,
      execution_allowed: false,
      external_action_taken: false,
    },
    { status: 429, headers: { 'Retry-After': String(Math.ceil(RATE_WINDOW_MS / 1000)) } },
  )
}
