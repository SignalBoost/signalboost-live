import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const pagePath = new URL('../app/dashboard/supervisor/protocol-capabilities/page.tsx', import.meta.url)
const clientPath = new URL('../app/dashboard/supervisor/protocol-capabilities/ProtocolCapabilityCatalogClient.tsx', import.meta.url)

test('protocol capability catalog requires authenticated admin access', async () => {
  const source = await readFile(pagePath, 'utf8')
  assert.match(source, /getCurrentUser/)
  assert.match(source, /redirect\('\/login'\)/)
  assert.match(source, /access\.isAdmin/)
})

test('catalog consumes only the read-only internal diagnostics endpoint', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.match(source, /\/api\/internal\/supervisor\/protocol-capabilities/)
  assert.match(source, /method: 'GET'/)
  assert.match(source, /cache: 'no-store'/)
  assert.doesNotMatch(source, /method: 'POST'/)
  assert.doesNotMatch(source, /method: 'PUT'/)
  assert.doesNotMatch(source, /method: 'DELETE'/)
})

test('catalog exposes protocol metadata without execution or mutation controls', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.match(source, /Operations/)
  assert.match(source, /Safety hints/)
  assert.match(source, /Evidence/)
  assert.match(source, /Execution controls exposed: no/)
  assert.match(source, /Mutation controls exposed: no/)
  assert.doesNotMatch(source, /onClick=/)
})
