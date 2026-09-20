// saas/tests/proxySessionRefresh.node.test.ts
// Production 2026-09-19: a ~90-second window of 503s and 401s left the owner signed out of
// /dashboard and /api/admin until a manual /auth/callback. Supabase access tokens are renewed by
// WRITING cookies, and every server-side client in this app swallows that write because Server
// Components may not set cookies. Only the operator path ran anywhere writes were allowed, so on
// every other surface an expiring session was simply lost - for the owner and for any customer.
//
// Next 16 replaced middleware with proxy, so the refresh belongs in proxyBase, not a second file.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'

const base = readFileSync(new URL('../proxyBase.ts', import.meta.url), 'utf8')
const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')
const access = readFileSync(new URL('../lib/auth/access.ts', import.meta.url), 'utf8')
const adminLayout = readFileSync(new URL('../app/admin/layout.tsx', import.meta.url), 'utf8')
const hubLayout = readFileSync(new URL('../app/hub/layout.tsx', import.meta.url), 'utf8')
const navbar = readFileSync(new URL('../components/PremiumCustomerNavbarV2.tsx', import.meta.url), 'utf8')
const authMe = readFileSync(new URL('../app/api/auth/me/route.ts', import.meta.url), 'utf8')
const credits = readFileSync(new URL('../app/api/credits/route.ts', import.meta.url), 'utf8')
const code = base.split('\n')
  .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
  .join('\n')

test('there is no middleware.ts: Next 16 permits only proxy.ts', () => {
  // Shipping both fails the build outright with middleware-to-proxy.
  assert.equal(existsSync(new URL('../middleware.ts', import.meta.url)), false)
})

test('authenticated surfaces beyond the operator path refresh their session', () => {
  assert.match(code, /authenticatedSurface = pathname\.startsWith\('\/dashboard'\) \|\| pathname\.startsWith\('\/admin'\) \|\| pathname\.startsWith\('\/hub'\) \|\| pathname\.startsWith\('\/api\/admin'\)/)
  assert.match(code, /return refreshAuthCookies\(req\)/)
  assert.match(code, /await supabase\.auth\.getClaims\(\)/)
  assert.doesNotMatch(code, /refreshAuthCookies[\s\S]{0,1200}auth\.getUser\(\)/)
})

test('the refresh writes cookies into both the current request and continuing response', () => {
  assert.match(code, /req\.cookies\.set\(name, value\)/)
  assert.match(code, /res\.cookies\.set\(name, value, options\)/)
  assert.match(code, /NextResponse\.next\(\{ request: \{ headers: req\.headers \} \} \)|NextResponse\.next\(\{ request: \{ headers: req\.headers \} \}\)/)
})

test('there is ONE refresh implementation, shared with the operator guard', () => {
  // Two copies drift; the operator path already had this logic and now reuses it.
  assert.equal((code.match(/createServerClient\(/g) || []).length, 1)
  assert.match(code, /const \{ supabase, response \} = await supabaseForRefresh\(req\)/)
})

test('requests without a session do no work', () => {
  // 63 scheduled crons plus public traffic: an unconditional getUser() would add auth load to the
  // system already suspected of hitting a connection ceiling.
  assert.match(code, /if \(!authenticatedSurface \|\| !hasSessionCookie\(req\)\) return NextResponse\.next\(\)/)
})

test('an auth outage never takes the site down', () => {
  assert.match(code, /catch \{[\s\S]{0,200}return NextResponse\.next\(\{ request: \{ headers: req\.headers \} \}\)/)
})

test('the refresh decides nothing: no redirect, no authorization', () => {
  const refresh = code.slice(code.indexOf('async function refreshAuthCookies'), code.indexOf('export async function proxy'))
  for (const forbidden of ['redirect', 'OWNER_EMAILS', 'isOwner', 'status: 401', 'status: 403']) {
    assert.ok(!refresh.includes(forbidden), `refresh must not contain ${forbidden}`)
  }
})

test('the operator guard keeps its owner check and its redirect', () => {
  assert.match(code, /OWNER_EMAILS\.includes\(email\)/)
  assert.match(code, /NextResponse\.redirect\(new URL\('\/dashboard', req\.url\)\)/)
})

test('both matchers cover the surfaces that need refreshing, and stay in step', () => {
  for (const source of [proxy, base]) {
    const matcher = source.slice(source.indexOf('matcher'))
    for (const path of ['/dashboard/:path*', '/admin/:path*', '/hub/:path*', '/api/admin/:path*', '/dashboard/operator/:path*']) {
      assert.ok(matcher.includes(path), `matcher must include ${path}`)
    }
  }
})

test('the existing ingress routing is untouched', () => {
  // proxy.ts still owns provenance, fast-transform and the spend gate exactly as before.
  assert.match(proxy, /pathname === '\/api\/concierge'/)
  assert.match(proxy, /cos-provenance-browser/)
  assert.match(proxy, /return baseProxy\(req\)/)
})


test('transient auth failures are unavailable, never guest', () => {
  assert.match(access, /authState: AuthState/)
  assert.match(access, /supabase\.auth\.getClaims\(\)/)
  assert.doesNotMatch(access, /supabase\.auth\.getUser\(\)/)
  assert.match(access, /'guest', 'unavailable'/)
  assert.match(access, /status: 503, error: 'Authentication temporarily unavailable\.'/)
})

test('transient refresh failures discard cookie mutations', () => {
  assert.match(base, /error && isTransientAuthError\(error\)/)
  assert.match(base, /return NextResponse\.next\(\{ request: \{ headers: req\.headers \} \}\)/)
})

test('protected layouts do not redirect while auth is unavailable', () => {
  for (const layout of [adminLayout, hubLayout]) {
    assert.match(layout, /access\.authState === 'unavailable'/)
    const unavailable = layout.indexOf("access.authState === 'unavailable'")
    const redirectGuest = layout.indexOf("access.role === 'guest'")
    assert.ok(unavailable >= 0 && redirectGuest > unavailable)
  }
})

test('browser navbar preserves last known user on retryable auth failures', () => {
  assert.match(navbar, /supabase\.auth\.getSession\(\)/)
  assert.match(navbar, /if \(error && isTransientAuthError\(error\)\) return/)
})

test('/api/auth/me verifies signed claims and returns 503 instead of guest on transient auth failure', () => {
  assert.match(authMe, /auth\.getClaims\(\)/)
  assert.doesNotMatch(authMe, /auth\.getUser\(\)/)
  assert.match(authMe, /auth_temporarily_unavailable/)
  assert.match(authMe, /status: 503/)
  assert.match(authMe, /cookieStore\.set\(name, value, options\)/)
})

test('/api/credits verifies signed claims instead of doing a regional Auth user lookup', () => {
  assert.match(credits, /auth\.getClaims\(\)/)
  assert.doesNotMatch(credits, /auth\.getUser\(\)/)
  assert.match(credits, /auth_temporarily_unavailable/)
  assert.match(credits, /accessFromVerifiedIdentity\(userId, email\)/)
})
