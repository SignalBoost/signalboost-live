import assert from 'node:assert/strict'
import test from 'node:test'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

test('advisory diagnosis prompts are not live-current lookups', () => {
  assert.equal(
    requiresFreshExternalEvidence(
      'A 1.2 MW high-density compute row experiences a 15% transient spike in collective GPU power draw that threatens a PDU thermal breaker trip within 400 milliseconds. Explain the real-time telemetry control loop and the trade-offs between hardware-level DVFS throttling, packet pacing at the Top-of-Rack (ToR) switch, and preempting non-urgent checkpoint jobs to stabilize load without corrupting active model weights.',
    ),
    false,
  )
  assert.equal(
    requiresFreshExternalEvidence(
      'Which of the 6 injected corpus items were used? Name titles. If the owner advisory-diagnosis brief was injected, quote the section headings you followed.',
    ),
    false,
  )
})

test('real current-fact questions still require fresh evidence', () => {
  assert.equal(requiresFreshExternalEvidence('are there direct flights from Paramaribo to Sao Paulo?'), true)
  assert.equal(requiresFreshExternalEvidence("what is today's stock price for NVDA?"), true)
})
