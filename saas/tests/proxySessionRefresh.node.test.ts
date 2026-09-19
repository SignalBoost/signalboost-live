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
const code = base.split('\n')
  .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
  .join('\n')

test('there is no middleware.ts: Next 16 permits only proxy.ts', () => {
  // Shipping both fails the build outright with middleware-to-proxy.
  assert.equal(existsSync(new URL('../middleware.ts', import.meta.url)), false)
})

test('authenticated surfaces beyond the operator path refresh their session', () => {
  assert.match(code, /pathname\.startsWith\('\/dashboard'\) \|\| pathname\.startsWith\('\/api\/admin'\)/)
  assert.match(code, /return refreshAuthCookies\(req\)/)
  assert.match(code, /await supabase\.auth\.getUser\(\)/)
})

test('the refresh writes cookies onto a continuing response', () => {
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
  assert.match(code, /catch \{[\s\S]{0,200}return NextResponse\.next\(\)/)
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
    for (const path of ['/dashboard/:path*', '/api/admin/:path*', '/dashboard/operator/:path*']) {
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
