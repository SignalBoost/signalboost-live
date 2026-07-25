import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../components/supervisor/ProtocolCapabilitySummary.tsx', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../app/dashboard/supervisor/layout.tsx', import.meta.url), 'utf8')

test('supervisor layout surfaces the protocol capability summary', () => {
  assert.match(layout, /ProtocolCapabilitySummary/)
  assert.match(layout, /<ProtocolCapabilitySummary \/>/)
})

test('protocol capability summary uses the authenticated read-only endpoint', () => {
  assert.match(source, /\/api\/internal\/supervisor\/protocol-capabilities/)
  assert.match(source, /method: 'GET'/)
  assert.match(source, /cache: 'no-store'/)
})

test('protocol capability summary exposes no execution or mutation controls', () => {
  assert.match(source, /Read-only · no execution controls/)
  assert.doesNotMatch(source, /onClick=/)
  assert.doesNotMatch(source, /method: 'POST'/)
  assert.doesNotMatch(source, /method: 'PUT'/)
  assert.doesNotMatch(source, /method: 'DELETE'/)
})
