import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evidenceMismatchConfidenceCapActive,
  groundedEvidenceCeiling,
} from '../lib/ai/cos/groundingConfidence.ts'

const POWER_LEVER_PROMPT = 'A 1.2 MW high-density compute row experiences a 15% transient spike. Explain trade-offs between hardware-level DVFS throttling, packet pacing at the ToR switch, and preempting checkpoint jobs. PDU thermal breaker.'

const OFF_DOMAIN_GPU_SECURITY = [
  '[KG1] NVIDIA GPU architecture — supports — compute context resets and memory scrubbing mechanisms to clear GPU memory between tenant allocations',
  '[KG2] GPU memory residue — is a security concern in — multi-tenant deployments where sensitive data may remain if not explicitly cleared',
]

const RELEVANT_POWER_EVIDENCE = [
  '[KG1] row power telemetry — observed — a transient increase at the PDU during the workload event',
  '[CL1] DVFS power-cap behavior: frequency throttling can reduce measured accelerator power while the cap is active',
]

test('1.2 MW lever prompt plus off-domain GPU-security evidence is capped at 0.30', () => {
  assert.equal(evidenceMismatchConfidenceCapActive(POWER_LEVER_PROMPT, OFF_DOMAIN_GPU_SECURITY), true)
  assert.equal(groundedEvidenceCeiling(2, POWER_LEVER_PROMPT, OFF_DOMAIN_GPU_SECURITY), 0.30)
})

test('same power/lever prompt keeps normal evidence ceiling when exact cited evidence is on-domain', () => {
  assert.equal(evidenceMismatchConfidenceCapActive(POWER_LEVER_PROMPT, RELEVANT_POWER_EVIDENCE), false)
  assert.equal(groundedEvidenceCeiling(2, POWER_LEVER_PROMPT, RELEVANT_POWER_EVIDENCE), 0.90)
})

test('target power/lever class fails safe when exact cited-evidence mapping is not supplied yet', () => {
  assert.equal(evidenceMismatchConfidenceCapActive(POWER_LEVER_PROMPT), true)
  assert.equal(groundedEvidenceCeiling(2, POWER_LEVER_PROMPT), 0.30)
})

test('ordinary prompts and protected live-info families keep normal confidence bands', () => {
  for (const prompt of [
    'explain how connection pooling works',
    'are there direct flights from Paramaribo to Sao Paulo?',
    'what is the current TSLA stock price?',
    'ping 10.0.0.8 and tell me whether it is reachable',
  ]) {
    assert.equal(evidenceMismatchConfidenceCapActive(prompt, OFF_DOMAIN_GPU_SECURITY), false, prompt)
    assert.equal(groundedEvidenceCeiling(2, prompt, OFF_DOMAIN_GPU_SECURITY), 0.90, prompt)
  }
})

test('confidence mismatch evaluation has no cross-request state leakage', () => {
  assert.equal(groundedEvidenceCeiling(2, POWER_LEVER_PROMPT, OFF_DOMAIN_GPU_SECURITY), 0.30)
  assert.equal(groundedEvidenceCeiling(2, 'explain how connection pooling works'), 0.90)
  assert.equal(groundedEvidenceCeiling(2, POWER_LEVER_PROMPT, RELEVANT_POWER_EVIDENCE), 0.90)
  assert.equal(groundedEvidenceCeiling(2, POWER_LEVER_PROMPT, OFF_DOMAIN_GPU_SECURITY), 0.30)
})
