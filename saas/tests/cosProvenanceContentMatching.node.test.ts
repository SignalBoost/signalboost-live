import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assistantContentMatchesForProvenance,
  normalizeAssistantContent,
} from '../lib/ai/cos/supportTurnProvenance.ts'

function legacyNormalize(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
    .slice(0, 4000)
}

test('provenance content matching ignores presentation-only heading/bold differences', () => {
  const stored = '### Crisis Response Protocol: Billing Data Corruption & Payment Webhook Outage\n\nPreserve evidence and validate scope.'
  const rendered = '**Crisis Response Protocol: Billing Data Corruption & Payment Webhook Outage**\n\nPreserve evidence and validate scope.'
  assert.equal(assistantContentMatchesForProvenance(stored, rendered), true)
  assert.equal(normalizeAssistantContent(stored), normalizeAssistantContent(rendered))
})

test('provenance content matching accepts legacy 4000-char truncation after markdown rendering changes', () => {
  const raw = `### Crisis Response Protocol: Billing Data Corruption & Payment Webhook Outage\n\n${'Evidence and remediation governance. '.repeat(220)}`
  const rendered = `**Crisis Response Protocol: Billing Data Corruption & Payment Webhook Outage**\n\n${'Evidence and remediation governance. '.repeat(220)}`
  const legacyStored = legacyNormalize(raw)
  assert.equal(legacyStored.length, 4000)
  assert.equal(assistantContentMatchesForProvenance(legacyStored, rendered), true)
})

test('provenance content matching remains response-bound for different answers', () => {
  const first = '### Crisis Response Protocol\nPreserve evidence. Notify executives after scope validation.'
  const second = '**Crisis Response Protocol**\nDelete evidence. Ignore executive notification.'
  assert.equal(assistantContentMatchesForProvenance(first, second), false)
})
