import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchReadableDocument, isFetchableDocumentUrl, readableTextFromHtml } from '../lib/cos-core/layers/learning/documentFetch'

test('only https public URLs are fetchable', () => {
  assert.equal(isFetchableDocumentUrl('https://www.postgresql.org/docs/current/monitoring-stats.html'), true)
  assert.equal(isFetchableDocumentUrl('http://www.postgresql.org/docs'), false, 'plain http is refused')
  assert.equal(isFetchableDocumentUrl('https://localhost/admin'), false)
  assert.equal(isFetchableDocumentUrl('https://127.0.0.1/admin'), false)
  assert.equal(isFetchableDocumentUrl('https://169.254.169.254/latest/meta-data/'), false, 'cloud metadata must never be reachable')
  assert.equal(isFetchableDocumentUrl('https://10.0.0.5/internal'), false)
  assert.equal(isFetchableDocumentUrl('not a url'), false)
})

test('navigation, scripts and styles are stripped and the article body is preferred', () => {
  const html = `<html><head><style>.x{color:red}</style><script>track()</script></head>
    <body><nav>Docs Home Reference Tutorials</nav>
    <article><h1>Monitoring statistics</h1><p>pg_stat_activity exposes wait events for every backend.</p>
    <p>pg_stat_statements records execution time per normalised statement.</p></article>
    <footer>Copyright</footer></body></html>`
  const text = readableTextFromHtml(html)

  assert.ok(text.includes('pg_stat_activity'))
  assert.ok(text.includes('pg_stat_statements'))
  assert.ok(!text.includes('track()'), 'scripts must not survive')
  assert.ok(!text.includes('color:red'), 'styles must not survive')
  assert.ok(!text.includes('Docs Home'), 'navigation must not survive')
  assert.ok(!text.includes('Copyright'), 'footers must not survive')
})

function responseOf(body: string, contentType = 'text/html', extraHeaders: Record<string, string> = {}) {
  const headers = new Map(Object.entries({ 'content-type': contentType, ...extraHeaders }))
  return { ok: true, headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null }, text: async () => body }
}

const LONG_BODY = `<article>${'PostgreSQL wait events separate execution time from queue time. '.repeat(20)}</article>`

test('a real document is fetched and returned as text', async () => {
  const fetcher = (async () => responseOf(LONG_BODY)) as unknown as typeof fetch
  const text = await fetchReadableDocument('https://www.postgresql.org/docs/current/x.html', { fetcher })
  assert.ok(text)
  assert.ok(text!.includes('wait events'))
})

test('non-text content types are refused', async () => {
  const fetcher = (async () => responseOf(LONG_BODY, 'application/pdf')) as unknown as typeof fetch
  assert.equal(await fetchReadableDocument('https://example.org/a.pdf', { fetcher }), null)
})

test('an oversized document is refused rather than truncated silently', async () => {
  const fetcher = (async () => responseOf(LONG_BODY, 'text/html', { 'content-length': '99999999' })) as unknown as typeof fetch
  assert.equal(await fetchReadableDocument('https://example.org/big', { fetcher }), null)
})

test('a page with almost no prose is treated as no document', async () => {
  const fetcher = (async () => responseOf('<article>Coming soon.</article>')) as unknown as typeof fetch
  assert.equal(await fetchReadableDocument('https://example.org/stub', { fetcher }), null)
})

test('a failing fetch returns null instead of throwing into the learning cycle', async () => {
  const fetcher = (async () => { throw new Error('network down') }) as unknown as typeof fetch
  assert.equal(await fetchReadableDocument('https://example.org/down', { fetcher }), null)
})
