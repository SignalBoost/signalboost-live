// saas/tests/protocolCapabilitySummary.node.test.ts
//
// These assertions read component SOURCE, which makes them fragile by construction: they break
// on refactors that change nothing about behaviour. Two of them did exactly that — one pinned
// the self-closing `<ProtocolCapabilitySummary />` form before the component took a labels prop,
// and one pinned the English literal 'Read-only · no execution controls' before that text was
// localized out of the component. Both were rewritten to assert the PROPERTY rather than the
// spelling. The negative assertions below are the ones worth having: this component watches a
// governed execution surface, so it must never grow a control that acts on it.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../components/supervisor/ProtocolCapabilitySummary.tsx', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../app/dashboard/supervisor/layout.tsx', import.meta.url), 'utf8')

test('supervisor layout surfaces the protocol capability summary', () => {
  assert.match(layout, /import ProtocolCapabilitySummary from/)
  // Matches with or without props, so passing labels through does not break this.
  assert.match(layout, /<ProtocolCapabilitySummary(\s|\/>)/)
})

test('protocol capability summary uses the authenticated read-only endpoint', () => {
  assert.match(source, /\/api\/internal\/supervisor\/protocol-capabilities/)
  assert.match(source, /method: 'GET'/)
  assert.match(source, /cache: 'no-store'/)
})

test('protocol capability summary exposes no execution or mutation controls', () => {
  assert.doesNotMatch(source, /onClick=/)
  assert.doesNotMatch(source, /onSubmit=/)
  assert.doesNotMatch(source, /<form/)
  assert.doesNotMatch(source, /<button/)
  assert.doesNotMatch(source, /method: 'POST'/)
  assert.doesNotMatch(source, /method: 'PUT'/)
  assert.doesNotMatch(source, /method: 'PATCH'/)
  assert.doesNotMatch(source, /method: 'DELETE'/)
  // GET is the only verb this surface may ever issue.
  assert.equal([...source.matchAll(/method: '([A-Z]+)'/g)].every(match => match[1] === 'GET'), true)
})
