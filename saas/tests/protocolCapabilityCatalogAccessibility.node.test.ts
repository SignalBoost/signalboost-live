import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../app/dashboard/supervisor/protocol-capabilities/ProtocolCapabilityCatalogClient.tsx', import.meta.url), 'utf8')

test('protocol capability catalog exposes accessible loading and summary semantics', () => {
  assert.match(source, /role="status"/)
  assert.match(source, /aria-live="polite"/)
  assert.match(source, /aria-busy={!snapshot && !error}/)
  assert.match(source, /aria-labelledby="protocol-catalog-title"/)
})

test('protocol capability cards expose labelled regions and list semantics', () => {
  assert.match(source, /aria-labelledby={`protocol-\$\{protocol\.protocolId\}`}/)
  assert.match(source, /role="list"/)
  assert.match(source, /role="listitem"/)
})

test('protocol capability catalog remains responsive and non-mutating', () => {
  assert.match(source, /padding:'clamp\(16px,4vw,32px\)'/)
  assert.match(source, /flexWrap:'wrap'/)
  assert.doesNotMatch(source, /onClick=/)
  assert.doesNotMatch(source, /method: 'POST'/)
  assert.doesNotMatch(source, /method: 'PUT'/)
  assert.doesNotMatch(source, /method: 'DELETE'/)
})
