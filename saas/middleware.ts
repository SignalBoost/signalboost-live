// saas/middleware.ts
// Keeps signed-in sessions alive by refreshing Supabase auth cookies on the response.
//
// WHY THIS EXISTS
// Supabase access tokens are short-lived and are renewed by writing new cookies. Every server-side
// client in this app is created with a `setAll` that swallows the write:
//
//     setAll(cookiesToSet) { try { ... } catch { /* Called from a Server Component — safe to ignore. */ } }
//
// In a Server Component that catch is correct: Next forbids cookie writes there. But with no middleware
// to perform the refresh somewhere writes ARE allowed, nothing ever persists a renewed token. The
// consequence in Production on 2026-09-19: a ~90-second window where every cron returned 503 and
// /api/admin/* returned 401, after which the owner stayed signed out until a manual /auth/callback.
// A momentary auth hiccup became a permanent logout, for the owner and for any customer.
//
// Middleware runs where the response is still mutable, so the refreshed cookies can be attached both to
// the onward request (so route handlers and Server Components in the SAME request read the new token)
// and to the response (so the browser keeps it).
//
// LOAD DISCIPLINE, deliberate
// This file runs on every matched request, so a naive getUser() on each one would add auth traffic to a
// project that is already suspected of hitting a connection ceiling - making the failure it is meant to
// fix more likely. Two guards keep it cheap:
//   1. requests with no Supabase auth cookie do no work at all: an anonymous visitor costs one string
//      check, no network call;
//   2. the matcher excludes static assets and the cron/internal routes, which authenticate by secret,
//      have no user session to refresh, and are the highest-frequency traffic in the system.
//
// This file MUST NOT redirect, gate, or authorize. Authorization stays in lib/auth/access.ts, where it
// is testable and where the owner list lives. All this does is renew a token that is already valid.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'

/**
 * Supabase SSR names its cookies `sb-<project-ref>-auth-token` (sometimes chunked with a `.0` suffix).
 * Matching the prefix avoids hard-coding the project ref, which differs per environment.
 */
function hasSupabaseSession(request: NextRequest): boolean {
  return request.cookies.getAll().some(cookie => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'))
}

export async function middleware(request: NextRequest) {
  if (!hasSupabaseSession(request)) return NextResponse.next()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // Missing configuration must never block traffic: fail open, exactly as before this file existed.
  if (!url || !key) return NextResponse.next()

  let response = NextResponse.next({ request })

  try {
    const supabase = createServerClient(url, key, {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write to the request first so anything downstream in THIS request sees the refreshed
          // token, then rebuild the response so the browser receives it too.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    })

    // The call itself is the refresh: supabase-js renews an expiring token and emits the new cookies
    // through setAll above. The returned user is deliberately ignored - this file decides nothing.
    await supabase.auth.getUser()
  } catch {
    // An auth outage must not take the site down. Serving the request with the existing cookies is
    // strictly better than a 500, and is the behaviour that existed before this middleware.
    return response
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   _next/static, _next/image, favicon and common asset extensions - no session to refresh;
     *   api/cron/* and api/internal/* - authenticated by secret, no user session, and by far the
     *     highest-frequency traffic here (63 scheduled crons); refreshing on them would add auth load
     *     for no benefit.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/cron|api/internal|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
