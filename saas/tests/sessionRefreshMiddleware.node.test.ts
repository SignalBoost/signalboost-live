// saas/tests/sessionRefreshMiddleware.node.test.ts
// Production 2026-09-19: a ~90-second window of 503s and 401s left the owner permanently signed out
// until a manual /auth/callback, because no middleware existed to persist a refreshed auth cookie and
// every server-side client swallows cookie writes. These assertions pin the properties that make the
// repair safe to run on every request.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const SOURCE = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8')
const CODE = SOURCE.split('\n')
  .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
  .join('\n')

test('the middleware refreshes the session and returns the mutated response', () => {
  assert.match(CODE, /await supabase\.auth\.getUser\(\)/)
  assert.match(CODE, /response = NextResponse\.next\(\{ request \}\)/)
  assert.match(CODE, /response\.cookies\.set\(name, value, options\)/)
})

test('refreshed cookies reach the same request, not only the browser', () => {
  // Without this, a route handler in the same request still reads the expired token and 401s.
  const setAll = CODE.slice(CODE.indexOf('setAll(cookiesToSet)'))
  const requestWrite = setAll.indexOf('request.cookies.set(name, value)')
  const responseRebuild = setAll.indexOf('response = NextResponse.next({ request })')
  assert.ok(requestWrite > 0 && responseRebuild > requestWrite, 'request cookies must be set before the response is rebuilt')
})

test('anonymous requests do no work', () => {
  // 63 scheduled crons plus public traffic: an unconditional getUser() would add auth load to the very
  // system suspected of hitting a connection ceiling.
  assert.match(CODE, /if \(!hasSupabaseSession\(request\)\) return NextResponse\.next\(\)/)
  assert.match(CODE, /cookie\.name\.startsWith\('sb-'\) && cookie\.name\.includes\('auth-token'\)/)
  const guard = CODE.indexOf('hasSupabaseSession(request)')
  const client = CODE.indexOf('createServerClient(')
  assert.ok(guard > 0 && guard < client, 'the session check must precede client construction')
})

test('it fails open: missing config or an auth outage never blocks traffic', () => {
  assert.match(CODE, /if \(!url \|\| !key\) return NextResponse\.next\(\)/)
  assert.match(CODE, /catch \{[\s\S]{0,200}return response/)
  assert.doesNotMatch(CODE, /throw /)
})

test('it decides nothing: no redirect, no authorization, no owner logic', () => {
  for (const forbidden of ['NextResponse.redirect', 'NextResponse.rewrite', 'requireOwner', 'isOwner', 'ownerEmail', 'status: 401', 'status: 403']) {
    assert.ok(!CODE.includes(forbidden), `middleware must not contain ${forbidden}`)
  }
})

test('cookie options come from the shared module so they cannot drift', () => {
  assert.match(CODE, /import \{ saasSupabaseCookieOptions \} from '@\/lib\/auth\/cookies'/)
  assert.match(CODE, /cookieOptions: saasSupabaseCookieOptions/)
  // No local cookie policy: domain/sameSite/secure live in one place.
  assert.doesNotMatch(CODE, /sameSite:|secure:|domain:/)
})

test('the matcher excludes secret-authenticated and static traffic', () => {
  const matcher = CODE.slice(CODE.indexOf('matcher'))
  for (const excluded of ['_next/static', '_next/image', 'favicon.ico', 'api/cron', 'api/internal']) {
    assert.ok(matcher.includes(excluded), `matcher must exclude ${excluded}`)
  }
})

test('the matcher pattern behaves as written', () => {
  const pattern = /^\/((?!_next\/static|_next\/image|favicon\.ico|api\/cron|api\/internal|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)$/
  for (const path of ['/dashboard/cos-university-telemetry', '/api/admin/cos-university-telemetry', '/', '/pricing']) {
    assert.ok(pattern.test(path), `${path} should run the middleware`)
  }
  for (const path of ['/api/cron/cos-university-mass-distillation', '/api/internal/cos/hf-worker/x.py', '/_next/static/chunk.js', '/favicon.ico', '/logo.png']) {
    assert.ok(!pattern.test(path), `${path} should be skipped`)
  }
})
