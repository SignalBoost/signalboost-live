import assert from 'node:assert/strict'
import test from 'node:test'
import { findRecoveredAssistantReply } from '../lib/ai/cos/assistantTransportRecovery'

test('recovers the assistant reply for the exact send', () => {
  const sentAt = Date.parse('2026-08-12T21:02:00.000Z')
  const reply = findRecoveredAssistantReply([
    { role: 'user', content: 'diagnose latency', created_at: '2026-08-12T21:02:01.000Z' },
    { role: 'assistant', content: 'Recovered COS answer', created_at: '2026-08-12T21:02:44.000Z' },
  ], 'diagnose latency', sentAt)
  assert.equal(reply, 'Recovered COS answer')
})

test('does not recover an older identical benchmark turn', () => {
  const sentAt = Date.parse('2026-08-12T21:02:00.000Z')
  const reply = findRecoveredAssistantReply([
    { role: 'user', content: 'same benchmark', created_at: '2026-08-12T20:40:00.000Z' },
    { role: 'assistant', content: 'Old answer', created_at: '2026-08-12T20:40:30.000Z' },
  ], 'same benchmark', sentAt)
  assert.equal(reply, null)
})

test('stops at a newer user turn instead of pairing the wrong answer', () => {
  const sentAt = Date.parse('2026-08-12T21:02:00.000Z')
  const reply = findRecoveredAssistantReply([
    { role: 'user', content: 'diagnose latency', created_at: '2026-08-12T21:02:01.000Z' },
    { role: 'user', content: 'different question', created_at: '2026-08-12T21:02:02.000Z' },
    { role: 'assistant', content: 'Answer to different question', created_at: '2026-08-12T21:02:03.000Z' },
  ], 'diagnose latency', sentAt)
  assert.equal(reply, null)
})
