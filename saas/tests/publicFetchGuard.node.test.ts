// saas/tests/publicFetchGuard.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  assertPublicHttpUrl,
  guardedPublicFetch,
  isBlockedNetworkAddress,
  isPublicFetchDestinationRejection,
  PublicFetchError,
} from '../lib/security/publicFetchGuard.ts'

const resolveTo = (...addresses: string[]) => async () => addresses.map(address => ({ address }))
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } })

test('private, reserved and disguised internal addresses are blocked', () => {
  for (const address of [
    '127.0.0.1', '10.0.0.5', '172.16.3.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '224.0.0.1', '255.255.255.255', '198.18.0.1',
    '::1', '::', '[::1]', 'fd00::1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '::ffff:a9fe:a9fe',
    '64:ff9b::a9fe:a9fe', '64:ff9b::127.0.0.1', '2002:7f00:1::', 'not-an-ip',
  ]) assert.equal(isBlockedNetworkAddress(address), true, address)
})

test('ordinary public addresses are allowed', () => {
  for (const address of ['93.184.216.34', '8.8.8.8', '2606:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808']) {
    assert.equal(isBlockedNetworkAddress(address), false, address)
  }
})

test('URL validation rejects bad schemes, credentials, internal names and IP literals', async () => {
  const cases: Array<[string, string]> = [
    ['file:///etc/passwd', 'public_fetch_scheme_rejected'],
    ['gopher://example.com/', 'public_fetch_scheme_rejected'],
    ['https://user:pass@example.com/', 'public_fetch_url_invalid'],
    ['http://localhost/', 'public_fetch_host_rejected'],
    ['http://metadata.google.internal/', 'public_fetch_host_rejected'],
    ['http://127.0.0.1/', 'public_fetch_address_rejected'],
    ['http://2130706433/', 'public_fetch_address_rejected'],
    ['http://[::ffff:127.0.0.1]/', 'public_fetch_address_rejected'],
    ['http://169.254.169.254/latest/meta-data/', 'public_fetch_address_rejected'],
  ]
  for (const [url, code] of cases) {
    await assert.rejects(assertPublicHttpUrl(url, resolveTo('93.184.216.34')), (error: unknown) => error instanceof PublicFetchError && error.code === code, url)
  }
})

test('a public hostname that resolves to any internal address is rejected', async () => {
  await assert.rejects(assertPublicHttpUrl('https://rebind.example/', resolveTo('127.0.0.1')), /public_fetch_address_rejected/)
  await assert.rejects(assertPublicHttpUrl('https://mixed.example/', resolveTo('93.184.216.34', '10.0.0.1')), /public_fetch_address_rejected/)
  await assert.rejects(assertPublicHttpUrl('https://nothing.example/', async () => { throw new Error('ENOTFOUND') }), /public_fetch_dns_failed/)
  assert.equal((await assertPublicHttpUrl('https://example.com/', resolveTo('93.184.216.34'))).hostname, 'example.com')
})

test('every redirect hop is re-validated; a public page cannot bounce the fetch inward', async () => {
  const seen: string[] = []
  const fetchImpl = (async (url: string) => {
    seen.push(url)
    return redirect('http://169.254.169.254/latest/meta-data/')
  }) as unknown as typeof fetch
  await assert.rejects(
    guardedPublicFetch('https://example.com/', { resolver: resolveTo('93.184.216.34'), fetchImpl }),
    (error: unknown) => isPublicFetchDestinationRejection(error),
  )
  assert.deepEqual(seen, ['https://example.com/'])
})

test('public redirects are followed manually and the final URL is reported', async () => {
  const requests: Array<{ url: string; redirect?: RequestRedirect }> = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    requests.push({ url, redirect: init?.redirect })
    if (url === 'https://example.com/') return redirect('/home')
    return new Response('<title>ok</title>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }) as unknown as typeof fetch
  const result = await guardedPublicFetch('https://example.com/', { resolver: resolveTo('93.184.216.34'), fetchImpl })
  assert.equal(result.status, 200)
  assert.equal(result.finalUrl, 'https://example.com/home')
  assert.equal(result.contentType, 'text/html')
  assert.ok(requests.every(request => request.redirect === 'manual'))
})

test('redirect loops, oversized bodies and network errors fail with fixed codes only', async () => {
  const loop = (async () => redirect('https://example.com/again')) as unknown as typeof fetch
  await assert.rejects(guardedPublicFetch('https://example.com/', { resolver: resolveTo('93.184.216.34'), fetchImpl: loop, maxRedirects: 2 }), /public_fetch_redirect_limit/)

  const big = (async () => new Response('x'.repeat(2048), { status: 200 })) as unknown as typeof fetch
  await assert.rejects(guardedPublicFetch('https://example.com/', { resolver: resolveTo('93.184.216.34'), fetchImpl: big, maxBytes: 1024 }), /public_fetch_too_large/)

  const refused = (async () => { throw new Error('connect ECONNREFUSED 10.1.2.3:5432') }) as unknown as typeof fetch
  await assert.rejects(
    guardedPublicFetch('https://example.com/', { resolver: resolveTo('93.184.216.34'), fetchImpl: refused }),
    (error: unknown) => error instanceof PublicFetchError && error.message === 'public_fetch_network_error',
  )
})

test('non-2xx responses are returned so tools keep reporting the site status', async () => {
  const notFound = (async () => new Response('missing', { status: 404 })) as unknown as typeof fetch
  const result = await guardedPublicFetch('https://example.com/', { resolver: resolveTo('93.184.216.34'), fetchImpl: notFound })
  assert.equal(result.status, 404)
})

test('Website Optimizer, Podcast Optimizer and URL intelligence all use the shared guard', () => {
  const improve = readFileSync(new URL('../app/api/improve/route.ts', import.meta.url), 'utf8')
  const podcast = readFileSync(new URL('../app/api/podcast/optimize/route.ts', import.meta.url), 'utf8')
  const safeFetch = readFileSync(new URL('../lib/enterprise/url-intelligence/safeFetch.ts', import.meta.url), 'utf8')
  for (const source of [improve, podcast]) {
    assert.match(source, /guardedPublicFetch\(/)
    assert.match(source, /isPublicFetchDestinationRejection\(e\)/)
    assert.doesNotMatch(source, /redirect: 'follow'/)
    assert.doesNotMatch(source, /function isPrivateHost/)
  }
  assert.doesNotMatch(improve, /Could not reach that URL \(\$\{e\?\.message/)
  assert.match(podcast, /\(\^\|\\\.\)apple\\\.com\$/)
  assert.match(safeFetch, /isBlockedNetworkAddress/)
  const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')
  assert.match(gate, /publicFetchGuard\.node\.test\.ts/)
})
