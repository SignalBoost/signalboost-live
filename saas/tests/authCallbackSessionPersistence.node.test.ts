// saas/tests/authCallbackSessionPersistence.node.test.ts
// Production 2026-09-25: Supabase completed Google PKCE token exchange successfully, but the
// browser never issued the expected authenticated /user validation afterward. The callback had
// swallowed cookie-write failures and returned a separately-created redirect response.
//
// Pin the callback contract so a successful code exchange cannot be reported to the browser
// without carrying the session cookies on the exact redirect response.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/auth/callback/route.ts', import.meta.url), 'utf8')

test('OAuth callback writes Supabase session cookies directly onto the returned redirect response', () => {
  const redirectAt = source.indexOf('const redirectResponse = NextResponse.redirect')
  const clientAt = source.indexOf('createServerClient(')
  const exchangeAt = source.indexOf('exchangeCodeForSession(code)')
  const returnAt = source.indexOf('return redirectResponse')

  assert.ok(redirectAt >= 0, 'callback must create the redirect response explicitly')
  assert.ok(clientAt > redirectAt, 'redirect response must exist before Supabase can emit cookies')
  assert.ok(exchangeAt > clientAt, 'session exchange must use the response-bound cookie adapter')
  assert.ok(returnAt > exchangeAt, 'the same response carrying cookies must be returned')
  assert.match(source, /getAll\(\)\s*{\s*return req\.cookies\.getAll\(\)/)
  assert.match(source, /redirectResponse\.cookies\.set\(name, value, options\)/)
})

test('OAuth callback never silently swallows a session-cookie write failure', () => {
  assert.doesNotMatch(source, /from ["']next\/headers["']/)
  const setAllAt = source.indexOf('setAll(cookiesToSet)')
  const exchangeAt = source.indexOf('exchangeCodeForSession(code)')
  assert.ok(setAllAt >= 0 && exchangeAt > setAllAt)
  const setAllBlock = source.slice(setAllAt, exchangeAt)
  assert.doesNotMatch(setAllBlock, /catch\s*[{(]/)
})

test('OAuth callback accepts only local next-path redirects', () => {
  assert.match(source, /requestedNext\?\.startsWith\("\/"\)/)
  assert.match(source, /!requestedNext\.startsWith\("\/\/"\)/)
  assert.match(source, /new URL\(next, origin\)/)
})
