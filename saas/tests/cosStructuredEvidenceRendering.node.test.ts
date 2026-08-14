import assert from 'node:assert/strict'
import test from 'node:test'

function safeEvidenceText(value: unknown, max = 1200): string {
  const raw = typeof value === 'string'
    ? value
    : value && typeof value === 'object'
      ? JSON.stringify(value)
      : String(value ?? '')
  return raw.replace(/\s+/g, ' ').trim().slice(0, max)
}

test('structured learned facts remain readable JSON text', () => {
  const fact = { predicate: 'supports', object: 'tenant isolation', confidence: 0.92 }
  const rendered = safeEvidenceText(fact)
  assert.match(rendered, /"predicate":"supports"/)
  assert.match(rendered, /"object":"tenant isolation"/)
  assert.doesNotMatch(rendered, /\[object Object\]/)
})
