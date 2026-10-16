// saas/tests/conciergeDeliveredVisualHistory.node.test.ts
//
// Production 2026-10-16: COS charted VNCE but the Concierge showed the answer without the chart.
// The chart only travelled in the live HTTP response; History kept text only, so an answer shown
// from History (transport recovery, or a reopened chat) lost it. These tests pin the whole path.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MAX_DELIVERED_VISUAL_URL_CHARS,
  deliveredVisualFromProvenance,
  provenanceWithDeliveredVisual,
  safeDeliveredVisual,
} from '../lib/concierge/deliveredVisual.ts'
import { findRecoveredAssistantReply, findRecoveredAssistantTurn } from '../lib/ai/cos/assistantTransportRecovery.ts'
import { pairResumedTurns, resumableMessages } from '../lib/concierge/conversationResume.ts'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const chartVisual = { previewUrl: PNG, downloadUrl: PNG, filename: 'vnce_6mo.png', alt: 'VNCE' }

test('the delivered chart is recorded with the turn provenance, original provenance kept', () => {
  const stored = provenanceWithDeliveredVisual({ schema: 'x', answer_origin: { model: 'm' } }, chartVisual) as Record<string, any>
  assert.equal(stored.schema, 'x')
  assert.deepEqual(stored.answer_origin, { model: 'm' })
  assert.deepEqual(stored.delivered_visual, { previewUrl: PNG, filename: 'vnce_6mo.png' })
  assert.deepEqual(deliveredVisualFromProvenance(stored), { previewUrl: PNG, filename: 'vnce_6mo.png' })
})

test('answers without a visual store their provenance unchanged', () => {
  const provenance = { schema: 'x' }
  assert.equal(provenanceWithDeliveredVisual(provenance, undefined), provenance)
  assert.equal(provenanceWithDeliveredVisual(null, null), null)
})

test('only inline images or owner-scoped Builder previews are accepted', () => {
  assert.equal(safeDeliveredVisual({ previewUrl: 'https://evil.example/x.png' }), null)
  assert.equal(safeDeliveredVisual({ previewUrl: 'javascript:alert(1)' }), null)
  assert.equal(safeDeliveredVisual({ previewUrl: 'data:text/html;base64,PHNjcmlwdD4=' }), null)
  assert.equal(safeDeliveredVisual({ previewUrl: `data:image/png;base64,${'A'.repeat(MAX_DELIVERED_VISUAL_URL_CHARS)}` }), null)
  const builder = '/api/builder/workspaces/0f8fad5b-d9cb-469f-a165-70867728950e/files/out/chart.png?preview=1'
  assert.deepEqual(safeDeliveredVisual({ previewUrl: builder, filename: 'chart.png' }), { previewUrl: builder, filename: 'chart.png' })
  assert.equal(safeDeliveredVisual({ previewUrl: PNG, filename: '../etc/passwd' })?.filename, 'visual.png')
})

test('History transport recovery returns the chart with the answer', () => {
  const sentAt = Date.parse('2026-10-16T03:20:00Z')
  const messages = [
    { role: 'user', content: 'place in a graphic of VNCE stock price for the past six months', created_at: '2026-10-16T03:20:01Z' },
    { role: 'assistant', content: "Here's the chart of VNCE.", created_at: '2026-10-16T03:20:40Z', provenance: provenanceWithDeliveredVisual({ schema: 'x' }, chartVisual) },
  ]
  const turn = findRecoveredAssistantTurn(messages, 'place in a graphic of VNCE stock price for the past six months', sentAt)
  assert.deepEqual(turn, { reply: "Here's the chart of VNCE.", visual: { previewUrl: PNG, filename: 'vnce_6mo.png' } })
  // The text-only helper used by other surfaces is unchanged.
  assert.equal(findRecoveredAssistantReply(messages, 'place in a graphic of VNCE stock price for the past six months', sentAt), "Here's the chart of VNCE.")
})

test('a reopened conversation shows the chart again; text-only turns are unchanged', () => {
  const messages = resumableMessages([
    { role: 'user', content: 'chart VNCE' },
    { role: 'assistant', content: 'Here is the chart.', provenance: { delivered_visual: { previewUrl: PNG, filename: 'vnce_6mo.png' } } },
    { role: 'user', content: 'thanks' },
    { role: 'assistant', content: 'You are welcome.', provenance: { schema: 'x' } },
  ])
  assert.deepEqual(pairResumedTurns(messages), [
    { request: 'chart VNCE', response: 'Here is the chart.', visualPreviewUrl: PNG, visualFilename: 'vnce_6mo.png' },
    { request: 'thanks', response: 'You are welcome.' },
  ])
})

test('the server saves the visual with the turn and the client shows recovered visuals', () => {
  const browserRoute = readFileSync(new URL('../app/api/cos-provenance-browser/route.ts', import.meta.url), 'utf8')
  const client = readFileSync(new URL('../lib/ai/cos/agentProgressClient.ts', import.meta.url), 'utf8')
  assert.match(browserRoute, /provenance: provenanceWithDeliveredVisual\(payload\?\.execution_provenance \?\? null, payload\?\.visual\)/)
  assert.match(client, /\.\.\.\(turn\.visual \? \{ visual: turn\.visual \} : \{\}\)/)
  assert.doesNotMatch(client, /data: \{ reply: (?:saved|outcome\.reply), source: 'cos-transport-history-recovery' \}/)
})
