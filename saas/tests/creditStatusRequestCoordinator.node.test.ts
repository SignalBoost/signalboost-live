import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'

async function source(relativePath: string) {
  return readFile(path.resolve(process.cwd(), relativePath), 'utf8').then(hydrateLocalizedSource)
}

test('root layout mounts the credit request coordinator ahead of shared shell consumers', async () => {
  const layout = await source('app/layout.tsx')
  assert.match(layout, /CreditStatusRequestCoordinator/)
  assert.ok(layout.indexOf('<CreditStatusRequestCoordinator />') < layout.indexOf('<Navbar />'))
  assert.ok(layout.indexOf('<CreditStatusRequestCoordinator />') < layout.indexOf('<AppShell>'))
})

test('credit status coordination is narrow, short lived, and memory only', async () => {
  const coordinator = await source('components/runtime/CreditStatusRequestCoordinator.tsx')
  assert.match(coordinator, /CREDIT_STATUS_TTL_MS = 60_000/)
  assert.match(coordinator, /url\.pathname !== '\/api\/credits'/)
  assert.match(coordinator, /url\.origin !== window\.location\.origin/)
  assert.match(coordinator, /requestMethod\(input, init\) !== 'GET'/)
  assert.match(coordinator, /hasCustomHeaders\(init\?\.headers\) \|\| init\?\.body \|\| init\?\.signal/)
  assert.doesNotMatch(coordinator, /localStorage\.setItem|sessionStorage\.setItem/)
})

test('parallel credit readers share one native request and receive cloned bodies', async () => {
  const coordinator = await source('components/runtime/CreditStatusRequestCoordinator.tsx')
  assert.match(coordinator, /let inFlight: Promise<Response> \| null = null/)
  assert.match(coordinator, /if \(inFlight\) return \(await inFlight\)\.clone\(\)/)
  assert.match(coordinator, /response: response\.clone\(\)/)
  assert.match(coordinator, /return \(await requestPromise\)\.clone\(\)/)
})

test('credit cache cannot survive auth/session changes or metered credit mutations', async () => {
  const coordinator = await source('components/runtime/CreditStatusRequestCoordinator.tsx')
  assert.match(coordinator, /cookieFingerprint/)
  assert.match(coordinator, /supabase\.auth\.onAuthStateChange\(\(\) => invalidate\(\)\)/)
  assert.match(coordinator, /authListener\.subscription\.unsubscribe\(\)/)
  assert.match(coordinator, /key\.includes\('supabase'\) \|\| key\.includes\('auth'\)/)
  assert.match(coordinator, /signalboost:credits-invalidated/)
  assert.match(coordinator, /\/api\/video-generate/)
  assert.match(coordinator, /\/api\/video\/export/)
  assert.match(coordinator, /\/api\/video\/transcribe/)
  assert.match(coordinator, /\/api\/creative\/generate-image/)
  assert.match(coordinator, /if \(isMeteredMutation\(input, init\)\) invalidate\(\)/)
})

test('the coordinator never replaces server-side credit or permission enforcement', async () => {
  const coordinator = await source('components/runtime/CreditStatusRequestCoordinator.tsx')
  assert.doesNotMatch(coordinator, /spendCredit|spendVideoCredit|isOwner\s*=|isAdmin\s*=/)
  assert.match(coordinator, /The server remains authoritative/)
})
