import assert from 'node:assert/strict'
import test from 'node:test'
import { detectAdvisoryDiagnosisIntent } from '../lib/ai/cos/advisoryDiagnosisIntent.ts'
import { groundedEvidenceCeiling } from '../lib/ai/cos/groundingConfidence.ts'

test('1.2 MW lever prompt caps grounded confidence at 0.30', () => {
  detectAdvisoryDiagnosisIntent(
    'A 1.2 MW high-density compute row experiences a 15% transient spike. Explain trade-offs between hardware-level DVFS throttling, packet pacing at the ToR switch, and preempting checkpoint jobs. PDU thermal breaker.',
  )
  assert.equal(groundedEvidenceCeiling(2), 0.3)
})

test('ordinary prompts keep the two-cite 0.90 ceiling', () => {
  detectAdvisoryDiagnosisIntent('explain how connection pooling works')
  assert.equal(groundedEvidenceCeiling(2), 0.9)
})
