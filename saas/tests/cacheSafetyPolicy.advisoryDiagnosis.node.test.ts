import assert from 'node:assert/strict'
import test from 'node:test'
import { semanticCacheAllowedForPrompt } from '../lib/ai/cos/cacheSafetyPolicy.ts'

test('1.2 MW power-spike vignette must not replay semantic cache', () => {
  const prompt = 'A 1.2 MW high-density compute row experiences a 15% transient spike in collective GPU power draw that threatens a PDU thermal breaker trip within 400 milliseconds. Explain the real-time telemetry control loop and the trade-offs between hardware-level DVFS throttling, packet pacing at the Top-of-Rack (ToR) switch, and preempting non-urgent checkpoint jobs to stabilize load without corrupting active model weights.'
  assert.equal(semanticCacheAllowedForPrompt(prompt), false)
})

test('ordinary non-diagnosis prompts may still use cache', () => {
  assert.equal(semanticCacheAllowedForPrompt('explain how connection pooling works'), true)
})
